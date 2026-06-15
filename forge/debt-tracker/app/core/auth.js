import { createAuthModule } from '../../../../_shared/auth.js';
import { DebtAPI } from './api.js';

export const { writeSession, readSession, clearSession, showPinGate, hidePinGate, submitPin } =
  createAuthModule({
    sessionKey:  'dt_session',
    legacyKeys:  ['dt_pin'],
    verifyFn:    totp => DebtAPI.verify(totp),
    reloadEvent: 'dt:reload',
  });
