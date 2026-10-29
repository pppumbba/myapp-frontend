import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { t } from '@/i18n';

/** A few controls in the theme showing now, to judge colours, corners, font and size. */
export function ThemeSample() {
  return (
    <div className="space-y-3 rounded-xl bg-secondary p-3" aria-label={t("Sample")}>
      <div className="rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-md font-semibold text-primary">{t("Purchase orders")}</p>
          <Badge type="pill-color" size="sm" color="brand">
            {t("12 records")}
          </Badge>
        </div>
        <Input aria-label={t("Sample search")} size="sm" placeholder={t("Search")} />
        <ul className="mt-3 divide-y divide-secondary text-sm">
          <li className="flex justify-between py-2 text-secondary">
            <span>PO-261025001</span>
            <span className="tabular-nums">1,250.00</span>
          </li>
          <li className="flex justify-between bg-brand-primary_alt px-2 py-2 font-medium text-primary">
            <span>PO-261025002</span>
            <span className="tabular-nums">980.50</span>
          </li>
          <li className="flex justify-between py-2 text-tertiary">
            <span>PO-261025003</span>
            <span className="tabular-nums">74.00</span>
          </li>
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm">{t("Add")}</Button>
          <Button size="sm" color="secondary">
            {t("Export")}
          </Button>
          <Button size="sm" color="link-color">
            {t("Open")}
          </Button>
        </div>
      </div>
    </div>
  );
}
