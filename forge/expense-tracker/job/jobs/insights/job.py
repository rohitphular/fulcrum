import json
from datetime import datetime, timezone

from jobs.base import BaseJob
from jobs.insights.insights import ALL_INSIGHTS
from jobs.insights.period_utils import resolve_period

HEADERS = [
    'computed_at', 'insight_id', 'period_key',
    'derived_from', 'chart_variant', 'insight_payload', 'expert_commentary',
]


class InsightsJob(BaseJob):
    name        = 'insights'
    description = 'Pre-compute all insights and write to computed_insights sheet'

    def run(self) -> None:
        raw = {
            'transactions': self.sheets.read_sheet('transactions'),
            'accounts':     self.sheets.read_sheet('accounts'),
            'categories':   self.sheets.read_sheet('categories'),
            'rates':        self.sheets.read_sheet('rates'),
        }

        rate_map = {}
        for r in raw['rates']:
            try:
                rate_map[r['currency']] = float(r['rate'])
            except (KeyError, ValueError):
                pass

        quote_currency = self.config.get('quote_currency', 'GBP')
        now_iso        = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

        rows   = []
        errors = 0

        for InsightClass in ALL_INSIGHTS:
            insight = InsightClass(rate_map, quote_currency)
            for period_key in insight.periods:
                from_date, to_date = resolve_period(period_key)
                for derived in insight.derived_from:
                    for variant in insight.chart_variants:
                        try:
                            payload = insight.compute(raw, from_date, to_date, derived, variant)
                            rows.append([
                                now_iso,
                                insight.insight_id,
                                period_key,
                                derived,
                                variant,
                                json.dumps(payload, separators=(',', ':')),
                                '',
                            ])
                        except Exception as e:
                            tag = f'{insight.insight_id}/{period_key}/{derived}/{variant}'
                            print(f'  [insights] SKIP {tag}: {e}')
                            errors += 1

        self.sheets.replace_today_and_trim('computed_insights', HEADERS, rows, retain_days=30)
        print(f'  [insights] {len(rows)} rows written, {errors} skipped')
