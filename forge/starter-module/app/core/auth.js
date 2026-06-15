import { createAuthModule } from '../../../../_shared/auth.js';
import { StarterAPI } from './api.js';

export const { writeSession, readSession, clearSession, showPinGate, hidePinGate, submitPin } =
  createAuthModule({
    sessionKey:  'sm_session',
    legacyKeys:  ['forge_session', 'forge_pin'],
    verifyFn:    totp => StarterAPI.verify(totp),
    reloadEvent: 'sm:reload',
  });
