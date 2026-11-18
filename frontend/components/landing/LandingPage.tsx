"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Aperture,
  Bookmark,
  Check,
  Compass,
  Heart,
  Image as ImageIcon,
  Leaf,
  MapPin,
  Menu,
  Search,
  X,
} from "./Icons";
import { Button } from "./Button";
import {
  wildlifeCollections as collections,
  wildlifePhotos as photographs,
  filterWildlifePhotos as filterPhotographs,
  stepWildlifePhoto as stepPhoto,
  type WildlifeCollection as Collection,
  type WildlifePhoto as Photograph,
} from "@/lib/wildlifeSamples";

export function LandingPage() {
  const [activeCollection, setActiveCollection] = useState<Collection>("All photos");
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<Photograph | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [notesReady, setNotesReady] = useState(false);

  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem("natuvara-saved-photos") ?? "[]");
      if (Array.isArray(stored)) {
        setSaved(stored.filter((id): id is string => typeof id === "string" && photographs.some((photo) => photo.id === id)));
      }
    } catch {
      // Field notes still work when browser storage is unavailable.
    }
    setNotesReady(true);
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  useEffect(() => {
    if (!notesReady) return;
    try { localStorage.setItem("natuvara-saved-photos", JSON.stringify(saved)); } catch { /* Keep notes in memory. */ }
  }, [saved, notesReady]);

  const filteredPhotos = useMemo(
    () => filterPhotographs(activeCollection, query),
    [activeCollection, query],
  );

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    document.getElementById("discover")?.scrollIntoView({ behavior: "smooth" });
  }

  function toggleSaved(id: string) {
    const wasSaved = saved.includes(id);
    setSaved((current) =>
      wasSaved ? current.filter((savedId) => savedId !== id) : [...current, id],
    );
    setToast(wasSaved ? "Removed from saved photos" : "Photo saved");
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2400);
  }

  const savedPhotos = photographs.filter((photo) => saved.includes(photo.id));

  return (
    <div className="landing-shell" id="natuvara-home">
      <div className="announcement-bar">
        <span className="signal-dot" aria-hidden="true" />
        <span>A CLOSER LOOK AT THE WILD</span>
        <span className="announcement-divider" aria-hidden="true" />
        <span className="announcement-copy">Discover wildlife photography. Support independent creators.</span>
        <a href="#discover" className="announcement-link">
          Discover the collection <ArrowUpRight aria-hidden="true" />
        </a>
      </div>

      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="NatuVara home">
          <span className="wordmark-symbol"><Aperture aria-hidden="true" /></span>
          <span>Natu<span>Vara</span><small>NATURE IN FOCUS</small></span>
        </a>

        <nav id="landing-navigation" className={menuOpen ? "main-nav is-open" : "main-nav"} aria-label="Main navigation">
          <a className="nav-active" href="#discover" onClick={() => setMenuOpen(false)}>Discover</a>
          <a href="#journal" onClick={() => setMenuOpen(false)}>Our community</a>
          <a href="#photographers" onClick={() => setMenuOpen(false)}>For photographers</a>
          <Link href="/gallery" onClick={() => setMenuOpen(false)}>Gallery</Link>
          <Link className="mobile-sign-in" href="/auth/login" onClick={() => setMenuOpen(false)}>Sign in</Link>
        </nav>

        <div className="topbar-actions">
          <Link className="login-link" href="/auth/login">Sign in</Link>
          <Button
            variant="ghost"
            className="saved-link"
            onClick={() => document.getElementById("saved-photos")?.scrollIntoView({ behavior: "smooth" })}
          >
            <Bookmark aria-hidden="true" />
            <span>Saved photos</span>
            <span className="saved-count">{saved.length}</span>
          </Button>
          <Link className="landing-button join-button" href="/photographer/login">Sell your work <ArrowUpRight aria-hidden="true" /></Link>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="mobile-menu-trigger"
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
          aria-controls="landing-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </Button>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <img className="hero-image" src={photographs[0].src} alt="A lion in the late Serengeti light, watching the grasslands." />
          <div className="hero-vignette" aria-hidden="true" />
          <div className="hero-coordinate"><span className="coordinate-cross">+</span> SERENGETI &nbsp;·&nbsp; TANZANIA</div>
          <div className="hero-layout">
            <div className="hero-copy">
              <div className="hero-kicker"><span className="kicker-line" /> WILDLIFE PHOTOGRAPHY, DIRECT FROM THE CREATOR</div>
              <h1 id="hero-title">Wild places.<br /><em>Real stories.</em></h1>
              <p className="hero-description">
                Discover remarkable wildlife photography. Meet the people behind it, and find a frame that speaks to you.
              </p>
              <form className="hero-search" onSubmit={handleSearch} role="search">
                <Search aria-hidden="true" />
                <input
                  type="search"
                  aria-label="Search photographs, wildlife, or locations"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Try “lion”, “Serengeti”, or a photographer…"
                />
                <Button type="submit" aria-label="Search photographs"><ArrowRight aria-hidden="true" /></Button>
              </form>
              <div className="hero-search-footnote"><Leaf aria-hidden="true" /><span>Search by species, place, or photographer.</span></div>
            </div>

              <Button variant="ghost" className="hero-photo-note" onClick={() => setSelectedPhoto(photographs[0] ?? null)}>
              <span className="photo-note-top"><span>FEATURED PHOTOGRAPH</span><ArrowUpRight aria-hidden="true" /></span>
              <span className="photo-note-title">The Serengeti king.</span>
              <span className="photo-note-place"><MapPin aria-hidden="true" /> Serengeti, Tanzania</span>
              <span className="photo-note-index">01 <span>/</span> 08</span>
              </Button>
          </div>

          <div className="hero-bottomline">
            <a href="#discover" className="scroll-cue"><span className="scroll-icon"><ArrowDownRight aria-hidden="true" /></span> DISCOVER THE COLLECTION</a>
            <div className="hero-bottom-meta"><span>WILDLIFE, UP CLOSE</span><span className="meta-separator" /><span>INDEPENDENT CREATORS · LIGHTNING PAYMENTS</span></div>
            <div className="hero-count"><strong>01</strong><span> / </span> 08</div>
          </div>
          <span className="hero-credit">GILES LAURENT &nbsp;·&nbsp; CC BY-SA 4.0</span>
        </section>

        <section className="explore-section" id="discover" aria-labelledby="explore-heading">
          <div className="section-topline">
            <span><Compass aria-hidden="true" /> THE NATUVARA COLLECTION</span>
            <span>FIND YOUR PERSPECTIVE <ArrowDownRight aria-hidden="true" /></span>
          </div>

          <div className="explore-heading-row">
            <div>
              <p className="eyebrow">FROM THE SAVANNAH TO THE CANOPY</p>
              <h2 id="explore-heading">See the wild<span>.</span></h2>
            </div>
            <p className="section-intro">Big cats, quiet giants, and flashes of colour. <br />Discover the stories behind each photograph.</p>
          </div>

          <div className="category-row" role="group" aria-label="Filter by photo collection">
            <div className="category-scroll">
              {collections.map((collection, index) => (
                <Button
                  type="button"
                  variant="ghost"
                  className={activeCollection === collection ? "category-chip is-active" : "category-chip"}
                  key={collection}
                  onClick={() => setActiveCollection(collection)}
                  aria-pressed={activeCollection === collection}
                >
                  {index === 0 && <ImageIcon aria-hidden="true" />}
                  {collection}
                  {index === 0 && <span className="category-total">08</span>}
                </Button>
              ))}
            </div>
          </div>

          <div className="results-header" aria-live="polite" aria-atomic="true">
            <p><span className="results-indicator" /> SHOWING <strong>{filteredPhotos.length.toString().padStart(2, "0")}</strong> FRAMES <span className="results-note">· SAMPLE COLLECTION</span></p>
            <span className="sort-label">PHOTOGRAPHER CREDIT INCLUDED</span>
          </div>

          {filteredPhotos.length > 0 ? (
            <div className={`photo-grid ${filteredPhotos.length === 1 ? "is-single" : ""}`}>
              {filteredPhotos.map((photo, index) => (
                <PhotoTile
                  key={photo.id}
                  photo={photo}
                  index={index}
                  isSaved={saved.includes(photo.id)}
                  onOpen={() => setSelectedPhoto(photo)}
                  onSave={() => toggleSaved(photo.id)}
                />
              ))}
            </div>
          ) : (
            <div className="no-results">
              <Compass aria-hidden="true" />
              <h3>No photographs found.</h3>
              <p>Try a different search or browse all photos.</p>
              <Button onClick={() => { setQuery(""); setActiveCollection("All photos"); }}>Show all photos</Button>
            </div>
          )}

          <div className="sample-disclaimer"><Leaf aria-hidden="true" /> Explore these credited sample previews, or visit our gallery for approved marketplace listings.</div>
          <Link className="collection-link" href="/gallery">Explore the marketplace <ArrowUpRight aria-hidden="true" /></Link>
        </section>

        <section className="journal-section" id="journal">
          <div className="journal-mark"><span>NV.</span><span>BEHIND<br />THE LENS</span></div>
          <div className="journal-copy">
            <p className="eyebrow">OUR PHOTOGRAPHER COMMUNITY</p>
            <h2>A remarkable frame starts with someone who sees differently.</h2>
            <p>NatuVara connects people who love the natural world with the photographers who capture it. Discover their work, get to know their perspective, and support the next photograph.</p>
          </div>
            <Link className="journal-link" href="/photographer">Meet our photographers <ArrowUpRight aria-hidden="true" /></Link>
        </section>

        <section className="photographers-section" id="photographers">
          <div className="photographer-photo-wrap">
            <img src={photographs[3].src} alt="A cheetah on the horizon as the sun sets over the Okavango." />
            <span className="photo-caption">OKAVANGO DELTA, BOTSWANA &nbsp;·&nbsp; SUNSET</span>
          </div>
          <div className="photographers-copy">
            <p className="eyebrow">FOR THE PEOPLE BEHIND THE CAMERA</p>
            <h2>Your perspective.<br /><em>Your next chapter.</em></h2>
            <p>Create your photographer profile, upload your work, and set your price in sats. Once approved, your photographs appear in the NatuVara gallery.</p>
            <Link className="landing-button photographers-cta" href="/photographer/login">Start selling your work <ArrowUpRight aria-hidden="true" /></Link>
            <span className="photographers-note">PHOTOGRAPH YOUR WORLD. SHARE IT HERE. <span>✳</span></span>
          </div>
        </section>

        <section className="saved-photos-section" id="saved-photos" aria-label="Saved photographs">
          <div className="saved-photos-heading">
            <p className="eyebrow"><Bookmark aria-hidden="true" /> YOUR SAVED PHOTOS</p>
            <span>{savedPhotos.length.toString().padStart(2, "0")} SAVED PHOTOS</span>
          </div>
          {savedPhotos.length > 0 ? (
            <div className="saved-strip">
              {savedPhotos.map((photo) => (
                <button key={photo.id} className="saved-item" onClick={() => setSelectedPhoto(photo)}>
                  <img src={photo.src} alt="" />
                  <span>{photo.title}</span>
                  <ArrowUpRight aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : (
            <p className="saved-empty">Keep the photographs that caught your eye. <span>Tap the heart on a photo to save it here.</span></p>
          )}
        </section>
      </main>

      <footer className="footer">
        <a className="wordmark footer-wordmark" href="#top" aria-label="NatuVara home">
          <span className="wordmark-symbol"><Aperture aria-hidden="true" /></span>
          <span>Natu<span>Vara</span><small>NATURE IN FOCUS</small></span>
        </a>
        <p>Wildlife photography. Independent creators.</p>
        <span>NATUVARA &nbsp;·&nbsp; A WORLD WORTH SEEING</span>
      </footer>

      {toast && <div className="toast-message" role="status"><Check aria-hidden="true" /> {toast}</div>}
      {selectedPhoto && (
        <PhotoDialog
          photo={selectedPhoto}
          isSaved={saved.includes(selectedPhoto.id)}
          onClose={() => setSelectedPhoto(null)}
          onSave={() => toggleSaved(selectedPhoto.id)}
          onPrevious={() => setSelectedPhoto(stepPhoto(selectedPhoto, -1))}
          onNext={() => setSelectedPhoto(stepPhoto(selectedPhoto, 1))}
        />
      )}
    </div>
  );
}

function PhotoTile({
  photo,
  index,
  isSaved,
  onOpen,
  onSave,
}: {
  photo: Photograph;
  index: number;
  isSaved: boolean;
  onOpen: () => void;
  onSave: () => void;
}) {
  return (
    <article className={`photo-tile tile-photo-${photo.id}`}>
      <Button variant="ghost" className="tile-image-button" onClick={onOpen} aria-label={`View ${photo.title}, ${photo.species}`}>
        <img src={photo.src} alt={photo.alt} loading="lazy" style={{ objectPosition: photo.position }} />
        <span className="tile-overlay" />
        <span className="tile-field-tag"><span /> SAMPLE PREVIEW</span>
        <span className="tile-open-icon"><ArrowUpRight aria-hidden="true" /></span>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={`tile-save ${isSaved ? "is-saved" : ""}`}
        onClick={onSave}
        aria-label={isSaved ? `Remove ${photo.title} from saved photos` : `Save ${photo.title} to saved photos`}
        title={isSaved ? "Remove from saved photos" : "Save photo"}
        aria-pressed={isSaved}
      >
        <Heart aria-hidden="true" fill={isSaved ? "currentColor" : "none"} />
      </Button>
      <Button variant="ghost" className="tile-caption" onClick={onOpen}>
        <span className="tile-caption-copy">
          <span className="tile-title">{photo.title}</span>
          <span className="tile-meta">{photo.species} <i>·</i> {photo.location}</span>
        </span>
        <span className="tile-number">{String(index + 1).padStart(2, "0")} <ArrowUpRight aria-hidden="true" /></span>
      </Button>
      <a className="tile-credit" href={photo.sourceUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
        PHOTO: {photo.author} <span>·</span> {photo.license}
      </a>
    </article>
  );
}

function PhotoDialog({
  photo,
  isSaved,
  onClose,
  onSave,
  onPrevious,
  onNext,
}: {
  photo: Photograph;
  isSaved: boolean;
  onClose: () => void;
  onSave: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="photo-dialog-backdrop"
      aria-labelledby="dialog-title"
      aria-describedby="dialog-description"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") { event.preventDefault(); onPrevious(); }
        if (event.key === "ArrowRight") { event.preventDefault(); onNext(); }
      }}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section className="photo-dialog">
        <div className="dialog-image-wrap"><img src={photo.src} alt={photo.alt} /></div>
        <div className="dialog-panel">
          <div className="dialog-topline"><span><span className="results-indicator" /> SAMPLE PREVIEW / {photo.category.toUpperCase()}</span><Button variant="ghost" size="icon" onClick={onClose} aria-label="Close photo preview"><X aria-hidden="true" /></Button></div>
          <p className="eyebrow"><MapPin aria-hidden="true" /> {photo.location}</p>
          <h2 id="dialog-title">{photo.title}<span>.</span></h2>
          <p className="dialog-species" id="dialog-description">{photo.species}</p>
          <div className="dialog-rule" />
          <div className="dialog-credit"><span>PHOTOGRAPHER</span><strong>{photo.author}</strong><a href={photo.sourceUrl} target="_blank" rel="noreferrer">View original source <ArrowUpRight aria-hidden="true" /></a></div>
          <div className="dialog-license"><span>PHOTO LICENSE</span><a href={photo.licenseUrl} target="_blank" rel="noreferrer">{photo.license} <ArrowUpRight aria-hidden="true" /></a></div>
          <p className="dialog-disclaimer"><Leaf aria-hidden="true" /> This is a credited sample preview and is not available for purchase.</p>
          <div className="dialog-actions"><Button onClick={onSave} variant={isSaved ? "secondary" : "default"} aria-pressed={isSaved}>{isSaved ? <Check aria-hidden="true" /> : <Bookmark aria-hidden="true" />}{isSaved ? "Remove from saved" : "Save photo"}</Button><Button variant="outline" size="icon" aria-label="Previous photo" onClick={onPrevious}><ArrowLeft aria-hidden="true" /></Button><Button variant="outline" size="icon" aria-label="Next photo" onClick={onNext}><ArrowRight aria-hidden="true" /></Button></div>
        </div>
        <Button variant="ghost" size="icon" className="dialog-close" onClick={onClose} aria-label="Close photo preview"><X aria-hidden="true" /></Button>
      </section>
    </dialog>
  );
}
