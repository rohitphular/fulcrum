import { createAuthModule } from '../../../../_shared/auth.js';
import { ExpenseAPI } from './api.js';

export const { writeSession, readSession, clearSession, showPinGate, hidePinGate, submitPin, fetchGeo } =
  createAuthModule({
    sessionKey:  'et_session',
    legacyKeys:  ['et_pin'],
    verifyFn:    totp => ExpenseAPI.verify(totp),
    reloadEvent: 'et:reload',
  });
