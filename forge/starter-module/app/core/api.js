/* global SheetsClient */
export const StarterAPI = {
  verify: totp         => SheetsClient.verify(totp),
  list:   ()           => SheetsClient.list(),
  create: f            => SheetsClient.create(f),
  update: (id, fields) => SheetsClient.update(id, fields),
  remove: id           => SheetsClient.remove(id),
};
