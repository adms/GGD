import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, platformModelVersionsApi } from './api';

afterEach(() => vi.restoreAllMocks());
describe('production model selection adapter', () => {
  const state = { championId: 'hero', expectedHash: 'sha256:'+'a'.repeat(64), activeModelKey: 'champ.thorne', preferredModelKey: 'champ.thorne', selectionMode: 'automatic', versions: [] };
  it('reads and writes through the session-protected platform client', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue(state);
    expect((await platformModelVersionsApi.modelVersions.read('hero')).state).toEqual(state);
    expect(request).toHaveBeenLastCalledWith('/content-overlay/champions/hero/model-versions');
    const command = { action: 'automatic' as const, expectedHash: state.expectedHash };
    expect((await platformModelVersionsApi.modelVersions.update('hero', command)).state).toEqual(state);
    expect(request).toHaveBeenLastCalledWith('/content-overlay/champions/hero/model-versions', { body: command });
  });
  it('rejects malformed state instead of showing successful publication', async () => {
    vi.spyOn(api, 'request').mockResolvedValue({ ...state, selectionMode: 'unknown' });
    const result = await platformModelVersionsApi.modelVersions.read('hero');
    expect(result.state).toBeNull(); expect(result.error).toBeTruthy();
  });
});
