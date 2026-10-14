import Link from "next/link";
import { SIVUSTO } from "@/lib/sivusto";
import { VertailuLinkki } from "./vertailu/VertailuLinkki";

/** Sivun yläpalkki: nimi vasemmalla, raporttisivulla osiolinkit oikealla. Pysyy näkyvissä vierittäessä. */
export function Ylapalkki({ osiot }: { osiot?: readonly (readonly [string, string])[] }) {
  return (
    <header className="sticky top-0 z-30 border-b border-ink bg-page">
      <div className="mx-auto flex max-w-[1040px] flex-wrap items-center justify-between gap-x-6 px-4 sm:px-6">
        <Link href="/" className="flex min-h-11 items-center font-serif text-xl font-bold tracking-tight sm:text-[22px]">
          {SIVUSTO}
        </Link>
        <span className="ml-auto sm:order-last sm:ml-0">
          <VertailuLinkki />
        </span>
        {osiot && (
          <nav aria-label="Raportin osiot" className="-mx-4 w-[calc(100%+2rem)] overflow-x-auto px-2 [scrollbar-width:none] sm:mx-0 sm:w-auto sm:px-0">
            <ul className="flex whitespace-nowrap text-sm font-medium">
              {osiot.map(([id, nimi]) => (
                <li key={id}>
                  <a href={`#${id}`} className="inline-flex min-h-11 items-center px-2.5 hover:text-accent hover:underline">
                    {nimi}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </header>
  );
}
