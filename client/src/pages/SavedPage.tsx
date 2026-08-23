import { useState, useEffect, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { publicApi } from "../lib/api";
import { getSavedSlugs } from "../lib/preferences";
import StoryCard from "../components/StoryCard";
import type { PublicStory } from "@shared/types";

function BookmarkEmptyIcon() {
  return (
    <svg className="w-12 h-12 text-neutral-200 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  )
}

export default function SavedPage() {
  const [savedSlugs, setSavedSlugs] = useState<string[]>([]);

  useEffect(() => {
    setSavedSlugs(getSavedSlugs());
  }, []);

  const refreshSaved = useCallback(() => {
    setSavedSlugs(getSavedSlugs());
  }, []);

  useEffect(() => {
    window.addEventListener("storage", refreshSaved);
    window.addEventListener("ar-saved-changed", refreshSaved);
    return () => {
      window.removeEventListener("storage", refreshSaved);
      window.removeEventListener("ar-saved-changed", refreshSaved);
    };
  }, [refreshSaved]);

  const { data: stories, isLoading } = useQuery({
    queryKey: ["saved-stories", savedSlugs],
    queryFn: async () => {
      if (savedSlugs.length === 0) return [];
      const results = await Promise.allSettled(
        savedSlugs.map((slug) => publicApi.stories.get(slug)),
      );
      return results
        .filter(
          (r): r is PromiseFulfilledResult<PublicStory> =>
            r.status === "fulfilled",
        )
        .map((r) => r.value)
        .reverse();
    },
    enabled: savedSlugs.length > 0,
  });

  return (
    <>
      <Helmet>
        <title>Guardados - Voces Indígenas</title>
        <meta
          name="description"
          content="Tus noticias guardadas en Voces Indígenas."
        />
      </Helmet>
      <div className="page-section-wide">
        <header className="mb-8 border-b border-neutral-100 pb-6">
          <h1 className="text-2xl md:text-3xl font-bold mb-1">Noticias Guardadas</h1>
          {stories && stories.length > 0 && (
            <p className="text-sm text-neutral-500">{stories.length} {stories.length === 1 ? 'noticia guardada' : 'noticias guardadas'}</p>
          )}
        </header>

        {savedSlugs.length === 0 && (
          <div className="text-center py-16">
            <BookmarkEmptyIcon />
            <p className="text-neutral-600 font-medium mb-2">
              Aún no has guardado ninguna noticia
            </p>
            <p className="text-sm text-neutral-400 mb-8 max-w-xs mx-auto">
              Guarda noticias para leerlas más tarde usando el ícono de marcador en cada tarjeta.
            </p>
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-brand-500 rounded-full hover:bg-brand-600 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              Explorar noticias
            </Link>
          </div>
        )}

        {isLoading && savedSlugs.length > 0 && (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 bg-neutral-100 rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {stories && stories.length > 0 && (
          <div className="space-y-4">
            {stories.map((story) => (
              <StoryCard key={story.id} story={story} variant="horizontal" />
            ))}
          </div>
        )}

        {savedSlugs.length > 0 && (
          <p className="text-xs text-neutral-400 mt-10 text-center">
            Las noticias guardadas se almacenan solo en este navegador.
          </p>
        )}
      </div>
    </>
  );
}
