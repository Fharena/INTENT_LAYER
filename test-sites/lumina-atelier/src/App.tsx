type Residence = {
  name: string;
  location: string;
  detail: string;
  image: string;
  tone: string;
};

const residences: Residence[] = [
  {
    name: "Atrium House",
    location: "Jeju coast",
    detail: "A limestone residence arranged around a sunken winter garden.",
    image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
    tone: "Dawn stone"
  },
  {
    name: "Courtyard Loft",
    location: "Seongsu",
    detail: "A compact studio with layered glass, walnut, and hidden storage.",
    image: "https://images.unsplash.com/photo-1600210492493-0946911123ea?auto=format&fit=crop&w=1200&q=80",
    tone: "Warm walnut"
  },
  {
    name: "Garden Pavilion",
    location: "Namyangju",
    detail: "A quiet retreat where moss, cedar, and polished concrete meet.",
    image: "https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1200&q=80",
    tone: "Moss cedar"
  }
];

const materials = ["travertine", "charred cedar", "linen plaster", "aged brass", "moss tile"];

function cn(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

function App() {
  return (
    <main className="min-h-screen bg-porcelain text-ink">
      <header className="fixed left-0 right-0 top-0 z-20 border-b border-white/20 bg-ink/55 text-white backdrop-blur-md">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <a className="font-display text-2xl font-semibold tracking-normal" href="#top">
            Lumina Atelier
          </a>
          <div className="hidden items-center gap-7 text-sm font-medium md:flex">
            <a className="text-white/80 transition hover:text-white" href="#residences">
              Residences
            </a>
            <a className="text-white/80 transition hover:text-white" href="#materials">
              Materials
            </a>
            <a className="text-white/80 transition hover:text-white" href="#visit">
              Visit
            </a>
          </div>
          <a className="border border-white/40 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white hover:text-ink" href="#visit">
            Book a viewing
          </a>
        </nav>
      </header>

      <section id="top" className="relative flex min-h-[92vh] items-end overflow-hidden bg-ink text-white">
        <img
          className="absolute inset-0 h-full w-full object-cover opacity-70"
          src="https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=1800&q=80"
          alt="Sunlit modern architectural interior"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-transparent" />
        <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-8 px-5 pb-14 pt-32 md:grid-cols-[1.2fr_0.8fr] md:px-8">
          <div className="max-w-4xl">
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.28em] text-white/75">
              Quiet architecture for lived-in luxury
            </p>
            <h1 className="font-display text-6xl font-semibold leading-none tracking-normal md:text-8xl">
              Lumina Atelier
            </h1>
          </div>
          <div className="flex flex-col justify-end gap-6 border-l border-white/25 pl-6">
            <p className="max-w-md text-base leading-7 text-white/85">
              We design homes, boutique stays, and private rooms where daylight, material, and movement feel deliberate.
            </p>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="border border-white/25 p-3">
                <span className="block font-display text-3xl">18</span>
                <span className="text-white/70">active sites</span>
              </div>
              <div className="border border-white/25 p-3">
                <span className="block font-display text-3xl">42</span>
                <span className="text-white/70">rooms styled</span>
              </div>
              <div className="border border-white/25 p-3">
                <span className="block font-display text-3xl">6</span>
                <span className="text-white/70">cities</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="residences" className="mx-auto grid max-w-7xl gap-10 px-5 py-16 md:grid-cols-[0.72fr_1.28fr] md:px-8 md:py-24">
        <div className="sticky top-24 self-start">
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.24em] text-copper">Selected residences</p>
          <h2 className="font-display text-5xl font-semibold leading-tight md:text-6xl">
            Homes shaped by light before decoration.
          </h2>
        </div>
        <div className="grid gap-5">
          {residences.map((residence, index) => (
            <article
              className={cn(
                "grid overflow-hidden border border-ink/10 bg-white shadow-sm md:grid-cols-[0.9fr_1.1fr]",
                index === 1 ? "md:grid-cols-[1.1fr_0.9fr]" : "md:grid-cols-[0.9fr_1.1fr]"
              )}
              key={residence.name}
            >
              <img className="h-72 w-full object-cover md:h-full" src={residence.image} alt={residence.name} />
              <div className="flex min-h-[280px] flex-col justify-between gap-8 p-6 md:p-8">
                <div>
                  <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-moss">{residence.location}</p>
                  <h3 className="font-display text-4xl font-semibold">{residence.name}</h3>
                  <p className="mt-4 max-w-lg text-base leading-7 text-ink/70">{residence.detail}</p>
                </div>
                <div className="flex items-center justify-between border-t border-ink/10 pt-5 text-sm font-semibold">
                  <span>{residence.tone}</span>
                  <span>Case 0{index + 1}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="materials" className="bg-ink px-5 py-16 text-white md:px-8 md:py-24">
        <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="mb-4 text-sm font-bold uppercase tracking-[0.24em] text-copper">Material index</p>
            <h2 className="font-display text-5xl font-semibold leading-tight md:text-6xl">
              Texture carries the mood.
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {materials.map((material) => (
              <div className="border border-white/15 bg-white/5 p-5" key={material}>
                <span className="font-display text-3xl font-semibold capitalize">{material}</span>
                <p className="mt-3 text-sm leading-6 text-white/65">
                  Sampled against morning light, night lamps, and daily touch before it enters a room palette.
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="visit" className="mx-auto grid max-w-7xl gap-8 px-5 py-16 md:grid-cols-[1.1fr_0.9fr] md:px-8 md:py-24">
        <div className="overflow-hidden">
          <img
            className="h-[520px] w-full object-cover"
            src="https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1400&q=80"
            alt="Warm private lounge interior"
          />
        </div>
        <div className="flex flex-col justify-center border-y border-ink/15 py-8">
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.24em] text-copper">Private appointment</p>
          <h2 className="font-display text-5xl font-semibold leading-tight">
            Bring one difficult room. Leave with a material direction.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-ink/70">
            The test studio runs as a real React/Tailwind project so INTENT_LAYER can inspect source bindings, measure editable coverage, and patch simple Tailwind tokens.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button className="bg-ink px-5 py-3 text-sm font-bold text-white transition hover:bg-copper">
              Reserve studio hour
            </button>
            <button className="border border-ink/20 px-5 py-3 text-sm font-bold text-ink transition hover:border-copper hover:text-copper">
              Download lookbook
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;

