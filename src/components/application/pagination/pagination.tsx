import { ArrowLeft, ArrowRight, ChevronLeft, ChevronLeftDouble, ChevronRight, ChevronRightDouble, RefreshCw01 } from "@untitledui/icons";
import { useEffect, useState, type ReactNode } from "react";
import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";
import { Button } from "@/components/base/buttons/button";
import { InputBase } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { cx } from "@/utils/cx";
import { t } from "@/i18n";
import type { PaginationRootProps } from "./pagination-base";
import { Pagination } from "./pagination-base";

interface PaginationProps extends Partial<Omit<PaginationRootProps, "children">> {
    /** Whether the pagination buttons are rounded. */
    rounded?: boolean;
}

const PaginationItem = ({
    value,
    rounded,
    isCurrent,
}: {
    /** The page number this item navigates to, also used as its label. */
    value: number;
    /** Whether the button is a circle rather than a rounded square. */
    rounded?: boolean;
    /** Whether this item is the page currently being viewed, which highlights it and marks it as the current page. */
    isCurrent: boolean;
}) => {
    return (
        <Pagination.Item
            value={value}
            isCurrent={isCurrent}
            className={({ isSelected }) =>
                cx(
                    "flex size-9 cursor-pointer items-center justify-center p-3 text-sm font-medium text-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover hover:text-secondary focus-visible:z-10 focus-visible:bg-primary_hover focus-visible:outline-2 focus-visible:outline-offset-2",
                    rounded ? "rounded-full" : "rounded-lg",
                    isSelected && "bg-primary_hover text-secondary",
                )
            }
        >
            {value}
        </Pagination.Item>
    );
};

interface MobilePaginationProps {
    /** The current page. */
    page?: number;
    /** The total number of pages. */
    total?: number;
    /** The class name of the pagination component. */
    className?: string;
    /** The function to call when the page changes. */
    onPageChange?: (page: number) => void;
    /** A refresh button shown before the page. */
    refresh?: ReactNode;
}

const MobilePagination = ({ page = 1, total = 10, className, onPageChange, refresh }: MobilePaginationProps) => {
    return (
        <nav aria-label={t("Pagination")} className={cx("flex items-center gap-2 md:hidden", className)}>
            <span className="mr-auto text-sm text-fg-secondary">
                {t("Page {page} of {pages}", { page, pages: total })}
            </span>
            <Button
                aria-label={t("Go to previous page")}
                iconLeading={ChevronLeft}
                isDisabled={page === 1}
                color="secondary"
                size="xs"
                onClick={() => onPageChange?.(Math.max(0, page - 1))}
            />
            {refresh}
            <Button
                aria-label={t("Go to next page")}
                iconLeading={ChevronRight}
                isDisabled={page === total}
                color="secondary"
                size="xs"
                onClick={() => onPageChange?.(Math.min(total, page + 1))}
            />
        </nav>
    );
};

export const PaginationPageDefault = ({ rounded, page = 1, total = 10, className, ...props }: PaginationProps) => {
    const isDesktop = useBreakpoint("md");

    return (
        <Pagination.Root
            {...props}
            page={page}
            total={total}
            className={cx("flex w-full items-center justify-between gap-3 border-t border-secondary pt-4 md:pt-5", className)}
        >
            <div className="hidden flex-1 justify-start md:flex">
                <Pagination.PrevTrigger asChild>
                    <Button iconLeading={ArrowLeft} color="link-gray" size="sm">
                        {isDesktop ? "Previous" : undefined}
                    </Button>
                </Pagination.PrevTrigger>
            </div>

            <Pagination.PrevTrigger asChild className="md:hidden">
                <Button iconLeading={ArrowLeft} color="secondary" size="sm">
                    {isDesktop ? "Previous" : undefined}
                </Button>
            </Pagination.PrevTrigger>

            <Pagination.Context>
                {({ pages, currentPage, total }) => (
                    <>
                        <div className="hidden justify-center gap-0.5 md:flex">
                            {pages.map((page, index) =>
                                page.type === "page" ? (
                                    <PaginationItem key={index} rounded={rounded} {...page} />
                                ) : (
                                    <Pagination.Ellipsis key={index} className="flex size-9 shrink-0 items-center justify-center text-tertiary">
                                        &#8230;
                                    </Pagination.Ellipsis>
                                ),
                            )}
                        </div>

                        <div className="flex justify-center text-sm whitespace-pre text-fg-secondary md:hidden">
                            Page <span className="font-medium">{currentPage}</span> of <span className="font-medium">{total}</span>
                        </div>
                    </>
                )}
            </Pagination.Context>

            <div className="hidden flex-1 justify-end md:flex">
                <Pagination.NextTrigger asChild>
                    <Button iconTrailing={ArrowRight} color="link-gray" size="sm">
                        {isDesktop ? "Next" : undefined}
                    </Button>
                </Pagination.NextTrigger>
            </div>
            <Pagination.NextTrigger asChild className="md:hidden">
                <Button iconTrailing={ArrowRight} color="secondary" size="sm">
                    {isDesktop ? "Next" : undefined}
                </Button>
            </Pagination.NextTrigger>
        </Pagination.Root>
    );
};

export const PaginationPageMinimalCenter = ({ rounded, page = 1, total = 10, className, ...props }: PaginationProps) => {
    const isDesktop = useBreakpoint("md");

    return (
        <Pagination.Root
            {...props}
            page={page}
            total={total}
            className={cx("flex w-full items-center justify-between gap-3 border-t border-secondary pt-4 md:pt-5", className)}
        >
            <div className="flex flex-1 justify-start">
                <Pagination.PrevTrigger asChild>
                    <Button iconLeading={ArrowLeft} color="secondary" size="sm">
                        {isDesktop ? "Previous" : undefined}
                    </Button>
                </Pagination.PrevTrigger>
            </div>

            <Pagination.Context>
                {({ pages, currentPage, total }) => (
                    <>
                        <div className="hidden justify-center gap-0.5 md:flex">
                            {pages.map((page, index) =>
                                page.type === "page" ? (
                                    <PaginationItem key={index} rounded={rounded} {...page} />
                                ) : (
                                    <Pagination.Ellipsis key={index} className="flex size-9 shrink-0 items-center justify-center text-tertiary">
                                        &#8230;
                                    </Pagination.Ellipsis>
                                ),
                            )}
                        </div>

                        <div className="flex justify-center text-sm whitespace-pre text-fg-secondary md:hidden">
                            Page <span className="font-medium">{currentPage}</span> of <span className="font-medium">{total}</span>
                        </div>
                    </>
                )}
            </Pagination.Context>

            <div className="flex flex-1 justify-end">
                <Pagination.NextTrigger asChild>
                    <Button iconTrailing={ArrowRight} color="secondary" size="sm">
                        {isDesktop ? "Next" : undefined}
                    </Button>
                </Pagination.NextTrigger>
            </div>
        </Pagination.Root>
    );
};

export const PaginationCardDefault = ({ rounded, page = 1, total = 10, ...props }: PaginationProps) => {
    const isDesktop = useBreakpoint("md");

    return (
        <Pagination.Root
            {...props}
            page={page}
            total={total}
            className="flex w-full items-center justify-between gap-3 border-t border-secondary px-4 py-3 md:px-6 md:pt-3 md:pb-4"
        >
            <div className="flex flex-1 justify-start">
                <Pagination.PrevTrigger asChild>
                    <Button iconLeading={ArrowLeft} color="secondary" size="sm">
                        {isDesktop ? "Previous" : undefined}
                    </Button>
                </Pagination.PrevTrigger>
            </div>

            <Pagination.Context>
                {({ pages, currentPage, total }) => (
                    <>
                        <div className="hidden justify-center gap-0.5 md:flex">
                            {pages.map((page, index) =>
                                page.type === "page" ? (
                                    <PaginationItem key={index} rounded={rounded} {...page} />
                                ) : (
                                    <Pagination.Ellipsis key={index} className="flex size-9 shrink-0 items-center justify-center text-tertiary">
                                        &#8230;
                                    </Pagination.Ellipsis>
                                ),
                            )}
                        </div>

                        <div className="flex justify-center text-sm whitespace-pre text-fg-secondary md:hidden">
                            Page <span className="font-medium">{currentPage}</span> of <span className="font-medium">{total}</span>
                        </div>
                    </>
                )}
            </Pagination.Context>

            <div className="flex flex-1 justify-end">
                <Pagination.NextTrigger asChild>
                    <Button iconTrailing={ArrowRight} color="secondary" size="sm">
                        {isDesktop ? "Next" : undefined}
                    </Button>
                </Pagination.NextTrigger>
            </div>
        </Pagination.Root>
    );
};

interface PaginationCardMinimalProps {
    /** The current page. */
    page?: number;
    /** The total number of pages. */
    total?: number;
    /** The number of items per page. */
    pageSize?: number;
    /** The class name of the pagination component. */
    className?: string;
    /** The function to call when the page changes. */
    onPageChange?: (page: number) => void;
    /** The function to call when the page size changes. */
    onPageSizeChange?: (pageSize: number) => void;
    /** Shows a refresh button on the left that calls this. */
    onRefresh?: () => void;
    /** Spins the refresh icon while a load is on its way. */
    refreshing?: boolean;
}

const RefreshSpinning = ({ className }: { className?: string }) => <RefreshCw01 className={cx(className, "animate-spin motion-reduce:animate-none")} />;

/**
 * "Page [n] of N": type a page number and press Enter (or leave the box) to go there. The draft
 * is kept while typing, so "12" doesn't stop at page 1 on the way; out-of-range numbers are
 * pulled back to the first or last page, and anything else puts the current page back.
 */
const PageJump = ({ page, total, onPageChange }: { page: number; total: number; onPageChange?: (page: number) => void }) => {
    const [draft, setDraft] = useState(String(page));
    useEffect(() => setDraft(String(page)), [page]);

    const go = () => {
        const n = Number.parseInt(draft, 10);
        if (Number.isNaN(n)) return setDraft(String(page));
        const next = Math.min(Math.max(n, 1), total);
        setDraft(String(next));
        if (next !== page) onPageChange?.(next);
    };

    return (
        <div className="flex items-center gap-2 text-sm whitespace-nowrap text-fg-secondary">
            {t("Page")}
            <InputBase
                aria-label={t("Page number")}
                value={draft}
                inputMode="numeric"
                onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, ""))}
                onKeyDown={(event) => {
                    if (event.key === "Enter") go();
                    if (event.key === "Escape") setDraft(String(page));
                }}
                onBlur={go}
                onFocus={(event) => event.target.select()}
                size="sm"
                wrapperClassName="w-auto min-w-11"
                inputClassName="min-w-11 px-2 text-center tabular-nums field-sizing-content"
            />
            {t("of {pages}", { pages: total })}
        </div>
    );
};

/**
 * A compact pagination bar on the right: page, page size, then icon-only previous, refresh
 * and next.
 */
export const PaginationCardMinimal = ({
    page = 1,
    total = 10,
    pageSize = 10,
    onPageChange,
    className,
    onPageSizeChange,
    onRefresh,
    refreshing,
}: PaginationCardMinimalProps) => {
    const refresh = onRefresh && (
        <Button
            aria-label={t("Refresh")}
            iconLeading={refreshing ? RefreshSpinning : RefreshCw01}
            color="secondary"
            size="xs"
            onClick={onRefresh}
        />
    );
    return (
        <div className={cx("border-t border-secondary px-4 py-2 md:px-6", className)}>
            <MobilePagination page={page} total={total} onPageChange={onPageChange} refresh={refresh} />

            <nav aria-label={t("Pagination")} className="hidden items-center gap-2 md:flex">
                <div className="ml-auto flex items-center gap-2">
                    <PageJump page={page} total={total} onPageChange={onPageChange} />
                    {/* Only where the page size can change. */}
                    {onPageSizeChange && (
                        <Select
                            aria-label={t("Page size")}
                            value={pageSize}
                            onChange={(value) => onPageSizeChange(value as number)}
                            size="sm"
                            items={[
                                { label: t("{count} per page", { count: 10 }), id: 10 },
                                { label: t("{count} per page", { count: 25 }), id: 25 },
                                { label: t("{count} per page", { count: 50 }), id: 50 },
                                { label: t("{count} per page", { count: 100 }), id: 100 },
                            ]}
                        >
                            {(item) => (
                                <Select.Item id={item.id} key={item.id}>
                                    {item.label?.split(" ")[0]}
                                </Select.Item>
                            )}
                        </Select>
                    )}
                    <Button
                        aria-label={t("Go to previous page")}
                        iconLeading={ChevronLeft}
                        isDisabled={page === 1}
                        color="secondary"
                        size="xs"
                        onClick={() => onPageChange?.(Math.max(0, page - 1))}
                    />
                    {refresh}
                    <Button
                        aria-label={t("Go to next page")}
                        iconLeading={ChevronRight}
                        isDisabled={page === total}
                        color="secondary"
                        size="xs"
                        onClick={() => onPageChange?.(Math.min(total, page + 1))}
                    />
                </div>
            </nav>
        </div>
    );
};

interface PaginationButtonGroupProps extends Partial<Omit<PaginationRootProps, "children">> {
    /** The alignment of the pagination. */
    align?: "left" | "center" | "right";
}

export const PaginationButtonGroup = ({ align = "left", page = 1, total = 10, ...props }: PaginationButtonGroupProps) => {
    const isDesktop = useBreakpoint("md");

    return (
        <div
            className={cx(
                "flex border-t border-secondary px-4 py-3 md:px-6 md:pt-3 md:pb-4",
                align === "left" && "justify-start",
                align === "center" && "justify-center",
                align === "right" && "justify-end",
            )}
        >
            <Pagination.Root {...props} page={page} total={total}>
                <Pagination.Context>
                    {({ pages }) => (
                        <ButtonGroup size="sm">
                            <Pagination.PrevTrigger asChild>
                                <ButtonGroupItem iconLeading={ArrowLeft}>{isDesktop ? "Previous" : undefined}</ButtonGroupItem>
                            </Pagination.PrevTrigger>

                            {pages.map((page, index) =>
                                page.type === "page" ? (
                                    <Pagination.Item key={index} {...page} asChild>
                                        <ButtonGroupItem isSelected={page.isCurrent} className="size-9 items-center justify-center">
                                            {page.value}
                                        </ButtonGroupItem>
                                    </Pagination.Item>
                                ) : (
                                    <Pagination.Ellipsis key={index}>
                                        <ButtonGroupItem className="pointer-events-none size-9 items-center justify-center rounded-none!">
                                            &#8230;
                                        </ButtonGroupItem>
                                    </Pagination.Ellipsis>
                                ),
                            )}

                            <Pagination.NextTrigger asChild>
                                <ButtonGroupItem iconTrailing={ArrowRight}>{isDesktop ? "Next" : undefined}</ButtonGroupItem>
                            </Pagination.NextTrigger>
                        </ButtonGroup>
                    )}
                </Pagination.Context>
            </Pagination.Root>
        </div>
    );
};

interface PaginationCardAdvancedProps {
    /** The current page. */
    page?: number;
    /** The total number of pages. */
    total?: number;
    /** The number of items per page. */
    pageSize?: number;
    /** The alignment of the pagination. */
    align?: "space-between" | "center";
    /** The class name of the pagination component. */
    className?: string;
    /** The function to call when the page changes. */
    onPageChange?: (page: number) => void;
    /** The function to call when the page size changes. */
    onPageSizeChange?: (pageSize: number) => void;
}

export const PaginationCardAdvanced = ({
    page = 1,
    total = 10,
    pageSize = 10,
    align = "space-between",
    onPageChange,
    className,
    onPageSizeChange,
}: PaginationCardAdvancedProps) => {
    return (
        <div className={cx("border-t border-secondary px-4 py-3 md:px-6 md:pt-3 md:pb-4", className)}>
            <Pagination.Root
                page={page}
                total={total}
                onPageChange={onPageChange}
                className={cx("flex items-center gap-3", align === "center" && "justify-between")}
            >
                <div className="hidden items-center gap-2 text-sm font-medium whitespace-nowrap text-fg-secondary md:flex">
                    Page
                    <InputBase
                        aria-label="Page"
                        value={page.toString()}
                        onChange={(event) => onPageChange?.(Number(event.target.value))}
                        size="sm"
                        wrapperClassName="min-w-9"
                        inputClassName="text-center min-w-9 field-sizing-content"
                    />
                    of {total}
                </div>

                <hr className={cx("mx-1 h-4 w-px border-l border-primary max-md:hidden", align === "center" && "hidden")} />

                <div className={cx("hidden items-center gap-2 md:flex", align === "center" && "order-last")}>
                    <span className="text-sm font-medium whitespace-nowrap text-secondary">Rows per page</span>
                    <Select
                        aria-label="Page Size"
                        value={pageSize}
                        onChange={(value) => onPageSizeChange?.(value as number)}
                        size="sm"
                        items={[
                            { label: "10", id: 10 },
                            { label: "25", id: 25 },
                            { label: "50", id: 50 },
                            { label: "100", id: 100 },
                        ]}
                    >
                        {(item) => (
                            <Select.Item selectionIndicator="none" id={item.id}>
                                {item.label}
                            </Select.Item>
                        )}
                    </Select>
                </div>

                <div className={cx("flex flex-1 items-center gap-4 md:ml-auto md:justify-end", align === "center" && "md:justify-center")}>
                    <div className="flex gap-2">
                        <Button iconLeading={ChevronLeftDouble} color="secondary" size="sm" isDisabled={page === 1} onClick={() => onPageChange?.(1)} />
                        <Pagination.PrevTrigger asChild>
                            <Button iconLeading={ChevronLeft} color="secondary" size="sm" />
                        </Pagination.PrevTrigger>
                    </div>

                    <Pagination.Context>
                        {({ pages, currentPage, total }) => (
                            <>
                                <div className="hidden justify-center gap-0.5 md:flex">
                                    {pages.map((page, index) =>
                                        page.type === "page" ? (
                                            <PaginationItem key={index} {...page} />
                                        ) : (
                                            <Pagination.Ellipsis key={index} className="flex size-9 shrink-0 items-center justify-center text-tertiary">
                                                &#8230;
                                            </Pagination.Ellipsis>
                                        ),
                                    )}
                                </div>

                                <div className="flex flex-1 justify-center text-sm whitespace-pre text-fg-secondary md:hidden">
                                    Page <span className="font-medium">{currentPage}</span> of <span className="font-medium">{total}</span>
                                </div>
                            </>
                        )}
                    </Pagination.Context>

                    <div className="flex gap-2">
                        <Button
                            iconTrailing={ChevronRightDouble}
                            color="secondary"
                            size="sm"
                            isDisabled={page === total}
                            onClick={() => onPageChange?.(total)}
                        />
                        <Pagination.NextTrigger asChild>
                            <Button iconTrailing={ChevronRight} color="secondary" size="sm" />
                        </Pagination.NextTrigger>
                    </div>
                </div>
            </Pagination.Root>
        </div>
    );
};
