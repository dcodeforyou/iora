/**
 * Films routes only. The world's stylesheet is imported here rather than
 * in the root layout so it never loads for, or applies to, the existing
 * site — every selector inside is namespaced `.film-*` as a second line of
 * defence, but not shipping it elsewhere at all is the first.
 */
import "@/styles/film-world.css";

export default function FilmsLayout({ children }: LayoutProps<"/work/films">) {
  return children;
}
