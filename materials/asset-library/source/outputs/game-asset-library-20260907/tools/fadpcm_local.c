/* FMOD FADPCM frame layout, based on the public vgmstream decoder.
 * Upstream source retained in fadpcm_decoder.c; 0x8c bytes / 256 samples.
 * This adapter decodes interleaved complete frames into signed PCM16.
 */
#include <stdint.h>
#include <stddef.h>
#include <string.h>
static uint32_t u32(const uint8_t *p) { return (uint32_t)p[0] | (uint32_t)p[1]<<8 | (uint32_t)p[2]<<16 | (uint32_t)p[3]<<24; }
static int16_t s16(const uint8_t *p) { return (int16_t)(p[0] | p[1]<<8); }
int decode_fadpcm_buffer(const uint8_t *data, size_t length, int channels, int samples, int16_t *out) {
    static const int coefs[8][2]={{0,0},{60,0},{122,60},{115,52},{98,55},{0,0},{0,0},{0,0}};
    if (channels<1 || channels>8 || samples<0) return -1;
    size_t frames=((size_t)samples+255)/256;
    if(length<frames*140*channels) return -2;
    for(size_t frame=0;frame<frames;frame++) for(int channel=0;channel<channels;channel++) {
        const uint8_t *p=data+(frame*channels+channel)*140;
        uint32_t selectors=u32(p),shifts=u32(p+4);
        int h1=s16(p+8),h2=s16(p+10),local=0;
        for(int set=0;set<8;set++) {
            int index=((selectors>>(set*4))&15)%7,shift=(shifts>>(set*4))&15;
            for(int word=0;word<4;word++) {
                uint32_t n=u32(p+12+set*16+word*4);
                for(int nib=0;nib<8;nib++,local++) {
                    int sample=(n>>(nib*4))&15;
                    if(sample>=8) sample-=16;
                    sample=(sample*(1<<(6+shift))-h2*coefs[index][1]+h1*coefs[index][0])>>6;
                    if(sample>32767)sample=32767;
                    if(sample<-32768)sample=-32768;
                    size_t pos=frame*256+local;
                    if(pos<(size_t)samples)out[pos*channels+channel]=(int16_t)sample;
                    h2=h1;h1=sample;
                }
            }
        }
    }
    return 0;
}
