import io
from pathlib import Path
import struct
import tempfile
import unittest
import wave

from decode_wwise_intake import inspect_float32, inspect_pcm, inspect_riff


def wav_bytes():
    out = io.BytesIO()
    with wave.open(out, 'wb') as stream:
        stream.setparams((1, 2, 24000, 0, 'NONE', 'not compressed'))
        stream.writeframes(struct.pack('<4h', 0, -1000, 1000, 32767))
    return out.getvalue()


class WwiseDecodeTests(unittest.TestCase):
    def test_float_preserves_peaks_but_rejects_nonfinite_samples(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'float.wav'
            fmt = b'fmt ' + struct.pack('<IHHIIHH', 16, 3, 1, 24000, 96000, 4, 32)
            metadata = {'channels': 1, 'sampleRate': 24000, 'numberOfSamples': 2, 'playSamples': 2}
            for sample in [1.25, float('nan')]:
                chunks = fmt + b'data' + struct.pack('<Iff', 8, sample, -.5)
                path.write_bytes(b'RIFF' + struct.pack('<I', len(chunks) + 4) + b'WAVE' + chunks)
                if sample == sample:
                    result = inspect_float32(path, metadata)
                    self.assertEqual(result['samplesAboveUnity'], 1)
                    self.assertEqual(result['peakAbsFloat'], 1.25)
                else:
                    with self.assertRaisesRegex(ValueError, 'Non-finite'):
                        inspect_float32(path, metadata)

    def test_truncated_riff_cannot_be_complete_media(self):
        blob = wav_bytes()
        self.assertEqual(inspect_riff(blob)['sampleRate'], 24000)
        with self.assertRaisesRegex(ValueError, 'length'):
            inspect_riff(blob[:-2])

    def test_truncated_chunk_with_adjusted_outer_length_is_rejected(self):
        blob = bytearray(wav_bytes()[:-2])
        struct.pack_into('<I', blob, 4, len(blob) - 8)
        with self.assertRaisesRegex(ValueError, 'chunk'):
            inspect_riff(blob)

    def test_pcm_must_preserve_frames_rate_and_channels(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'sample.wav'
            path.write_bytes(wav_bytes())
            metadata = {'channels': 1, 'sampleRate': 24000, 'numberOfSamples': 4, 'playSamples': 4}
            result = inspect_pcm(path, metadata)
            self.assertEqual(result['fullScaleSamples'], 1)
            self.assertFalse(result['allSilent'])
            for field, value in [('channels', 2), ('sampleRate', 48000), ('numberOfSamples', 5), ('playSamples', 8)]:
                with self.subTest(field=field), self.assertRaises(ValueError):
                    inspect_pcm(path, {**metadata, field: value})


if __name__ == '__main__':
    unittest.main()
