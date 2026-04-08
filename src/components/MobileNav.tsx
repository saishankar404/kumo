import { useNavigate } from "react-router-dom";
import { FolderPlus, Trash2, X } from "lucide-react";
import { useState } from "react";

interface LibraryCollection {
  id: string;
  name: string;
  createdAt: string;
}

interface SavedLibraryItem {
  id: string;
  title: string;
  year?: number;
  doi?: string;
  pdfUrl?: string;
  landingUrl?: string;
  authors: string[];
  savedAt: string;
  collectionIds: string[];
}

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
  collections: LibraryCollection[];
  activeCollectionId: string;
  onSelectCollection: (id: string) => void;
  onDeleteCollection: (id: string) => void;
  canAddCollection: boolean;
  onAddCollection: () => void;
  savedLibrary: Record<string, SavedLibraryItem>;
  suggestedConcept: string | null;
  loading: boolean;
  onExploreField: (concept: string) => void;
  savedCount: number;
  onDeletePaper: (paperId: string) => void;
}

const stripHtml = (value: string) => value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const DEFAULT_COLLECTION: LibraryCollection = {
  id: "saved",
  name: "Saved",
  createdAt: new Date(0).toISOString(),
};

export default function MobileNav({
  isOpen,
  onClose,
  collections,
  activeCollectionId,
  onSelectCollection,
  onDeleteCollection,
  canAddCollection,
  onAddCollection,
  savedLibrary,
  suggestedConcept,
  loading,
  onExploreField,
  savedCount,
  onDeletePaper,
}: MobileNavProps) {
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const customCollections = collections.filter(
    (collection) => collection.id !== DEFAULT_COLLECTION.id
  );

  const visibleSavedRows = Object.values(savedLibrary);
  const savedRows = visibleSavedRows.length;

  if (!isOpen) return null;

  const handleDeleteCollection = (collectionId: string, collectionName: string) => {
    if (showDeleteConfirm === collectionId) {
      onDeleteCollection(collectionId);
      setShowDeleteConfirm(null);
    } else {
      setShowDeleteConfirm(collectionId);
      setTimeout(() => setShowDeleteConfirm(null), 3000);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 lg:hidden" onClick={onClose}>
        <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      </div>

      <aside className="hide-scrollbar fixed left-0 top-0 z-50 h-full w-[85vw] max-w-[340px] animate-in slide-in-from-left flex flex-col overflow-y-auto bg-white shadow-2xl lg:hidden">
        <div className="flex flex-col h-full">
          <div className="flex flex-col gap-5 p-5">
            <button
              onClick={() => {
                navigate("/");
                onClose();
              }}
              className="flex cursor-default items-center gap-3 px-1 active:opacity-80 transition-opacity"
            >
              <img
                src="/new_logo_no_bg.png"
                alt="Kumo"
                className="h-24 w-auto object-contain"
              />
            </button>

            <button
              onClick={onClose}
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 active:bg-gray-200"
            >
              <X className="h-5 w-5 text-gray-600" />
            </button>

            <nav className="flex items-center gap-4 pt-2">
              <a
                href="/about"
                onClick={onClose}
                className="text-[14px] font-semibold text-gray-600 active:text-gray-900"
              >
                about
              </a>
              <a
                href="https://github.com/saishankar404/kumo"
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                className="text-[14px] font-semibold text-gray-600 active:text-gray-900"
              >
                github
              </a>
            </nav>
          </div>

          <div className="h-px bg-gray-100" />

          <div className="flex-1 overflow-y-auto p-5">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                  Library
                </span>
                {canAddCollection && (
                  <button
                    type="button"
                    onClick={() => {
                      onAddCollection();
                      onClose();
                    }}
                    className="flex h-8 items-center gap-1 rounded-lg bg-gray-100 px-3 py-1 text-[12px] font-medium text-gray-600 active:bg-gray-200"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                    New
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  onSelectCollection("all");
                  onClose();
                }}
                className={`lib-tree-row w-full text-left pl-4 ${
                  activeCollectionId === "all" ? "active" : ""
                }`}
              >
                <span className="lib-dot" />
                <span className="flex-1 truncate">Saved</span>
                <span className="lib-count-badge">{savedRows || ""}</span>
              </button>

              {customCollections.map((collection) => (
                <div key={collection.id} className="collection-tree-item group flex items-center">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectCollection(collection.id);
                      onClose();
                    }}
                    className={`lib-tree-row flex-1 text-left pl-4 ${
                      activeCollectionId === collection.id ? "active" : ""
                    }`}
                  >
                    <span className="lib-dot" />
                    <span className="flex-1 truncate">{collection.name}</span>
                    <span className="lib-count-badge">
                      {Object.values(savedLibrary).filter((p) =>
                        p.collectionIds.includes(collection.id)
                      ).length || ""}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCollection(collection.id, collection.name)}
                    className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-400 active:bg-red-50 active:text-red-500"
                    aria-label={`Delete ${collection.name}`}
                  >
                    {showDeleteConfirm === collection.id ? (
                      <span className="text-[10px] font-bold">OK?</span>
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              ))}

              {visibleSavedRows.length === 0 ? (
                <div className="mt-2 rounded-[10px] border border-dashed border-gray-200 px-3 py-4 text-[12px] font-medium leading-relaxed text-gray-400">
                  Save papers to see them here.
                </div>
              ) : (
                <div className="mt-2 flex flex-col gap-1 pb-6">
                  {visibleSavedRows
                    .slice()
                    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
                    .slice(0, 8)
                    .map((paper) => {
                      const href =
                        paper.pdfUrl ||
                        (paper.doi ? `https://doi.org/${paper.doi}` : paper.landingUrl);
                      return (
                        <div key={paper.id} className="flex items-center gap-2">
                          <a
                            href={href || "/search"}
                            target="_blank"
                            rel="noreferrer"
                            onClick={onClose}
                            className="saved-item-link flex-1"
                            title={paper.title}
                          >
                            <span className="line-clamp-2 text-[12px] font-semibold leading-snug text-gray-700 active:text-[#0369a1]">
                              {stripHtml(paper.title)}
                            </span>
                            <span className="text-[11px] font-medium text-gray-400">
                              {paper.year || "Unknown"}
                            </span>
                          </a>
                          <button
                            onClick={() => onDeletePaper(paper.id)}
                            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600"
                            aria-label={`Remove ${stripHtml(paper.title)}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  {visibleSavedRows.length > 8 && (
                    <p className="ml-2 mt-1 text-[11px] font-semibold text-gray-400">
                      +{visibleSavedRows.length - 8} more
                    </p>
                  )}
                </div>
              )}

              {suggestedConcept && !loading && (
                <button
                  type="button"
                  onClick={() => {
                    onExploreField(suggestedConcept);
                    onClose();
                  }}
                  className="explore-field-btn mt-1 w-full"
                >
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#92400e]/60">
                    Explore Field
                  </p>
                  <p className="mt-0.5 text-[12px] font-bold text-[#92400e]">
                    {suggestedConcept}
                  </p>
                </button>
              )}
            </div>
          </div>

          <div className="border-t border-gray-100 p-5">
            <div className="text-[11px] font-medium leading-relaxed text-gray-400 opacity-70">
              Long live the grain.
              <br />
              © MMXXIV Kumo.
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}