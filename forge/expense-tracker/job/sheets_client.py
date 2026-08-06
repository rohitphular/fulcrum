import gspread
from google.oauth2.service_account import Credentials

_SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
]


class SheetsClient:
    def __init__(self, service_account_file: str, spreadsheet_id: str):
        creds = Credentials.from_service_account_file(service_account_file, scopes=_SCOPES)
        self._gc     = gspread.authorize(creds)
        self._ss     = self._gc.open_by_key(spreadsheet_id)
        self._spread = spreadsheet_id

    def read_sheet(self, name: str) -> list[dict]:
        try:
            ws = self._ss.worksheet(name)
        except gspread.exceptions.WorksheetNotFound:
            print(f"  [sheets] sheet not found: {name!r} — returning empty")
            return []
        rows = ws.get_all_records(numericise_ignore=['all'])
        print(f"  [sheets] read {len(rows)} rows from {name!r}")
        return rows

    def write_sheet(self, name: str, headers: list[str], rows: list[list]) -> None:
        try:
            ws = self._ss.worksheet(name)
            ws.clear()
        except gspread.exceptions.WorksheetNotFound:
            ws = self._ss.add_worksheet(title=name, rows=max(len(rows) + 10, 100), cols=len(headers))

        ws.update([headers] + rows, value_input_option='RAW')
        print(f"  [sheets] wrote {len(rows)} rows to {name!r}")
