---
title: PomoSapiens - Warstwa Anty-Korupcyjna (szew Supabase)
created: 2026-07-28
type: refactor-plan
---

# PomoSapiens - Warstwa Anty-Korupcyjna (ACL)

> To **plan, nie implementacja**. Żaden kod produkcyjny nie jest tu zmieniany. Każda teza jest cytowana jako
> `plik:linia` i zweryfikowana względem drzewa. Cel: wskazać najgorzej przeciekającą zależność zewnętrzną,
> udowodnić gdzie przekracza granice warstw i zaprojektować jeden domenowy szew (ACL), który stanie się
> *jedynym* miejscem znającym kształt tej zależności.

---

## Krok 0 - Odkryty kontekst

**Przeczytane dokumenty bazowe:**

- [context/foundation/tech-stack.md](../foundation/tech-stack.md) - starter 10x Astro z **"bundled database/auth/storage"** ([tech-stack.md:24](../foundation/tech-stack.md#L24)). Stack sprzedaje dostawcę DB/auth jako wymienialny, gotowy blok, ale **nigdzie w PRD Supabase nie jest zadeklarowana wprost jako wymienialna** (grep po swap/replace/vendor/portability w `prd.md` nie zwraca nic). Sygnał intencja-vs-kod jest więc *słaby*: starter traktuje dostawcę jak commodity, a kod wtapia go w każdą warstwę.
- [context/foundation/arch.md](../foundation/arch.md) - §8 nazywa już częściowy szew: *"One factory, typed `SupabaseClient<Database>`; returns `null` when unconfigured"* ([arch.md:574](../foundation/arch.md#L574)). Fabryka centralizuje **tworzenie klienta**, ale nie **jego użycie**, **kształt zapytań**, **typy wierszy** ani **kody błędów dostawcy** - to nadal przecieka (Krok 1).
- [context/domain/01-domain-distillation.md](01-domain-distillation.md) oraz [02-invariant-aggregate-refactor.md](02-invariant-aggregate-refactor.md) - wcześniejsze dokumenty w tej serii; to jest `03`.

**Stack:** Astro 6 SSR + wyspy React 19, Tailwind 4, wdrożenie na Cloudflare Workers. Persystencja + tożsamość: **Supabase** (Postgres + RLS + Auth).

**Zewnętrzne zależności runtime (z [package.json](../../package.json)):** `@supabase/ssr`, `@supabase/supabase-js`, `zod`, `recharts`, `@uiw/react-color`, `lucide-react`, `radix-ui`.

**Warstwy kodu:** middleware (`src/middleware.ts`) → strony SSR (`src/pages/**/*.astro`) → trasy API (`src/pages/api/**`) → plumbing + słownik domenowy (`src/lib/**`) → wygenerowane typy DB (`src/db/database.types.ts`) → wyspy klienckie (`src/components/**`).

---

## Krok 1 - Zidentyfikowane przeciekające zależności

Sprawdzono trzy zależności pod kątem przecieku przez granice. Pliki, które dziś "znają" każdą z nich:

### Kandydat A - Supabase (`@supabase/*` + wygenerowane typy `Database`)

Supabase przecieka **czterema odrębnymi kanałami**, przez pięć warstw.

**Kanał 1 - tworzenie klienta / wywołania SDK** (`createClient`, `.from()`, `.auth.*`):

| Plik:linia | Warstwa | Przeciek |
| --- | --- | --- |
| [src/lib/supabase.ts:1,10](../../src/lib/supabase.ts#L1) | plumbing | `createServerClient`, `parseCookieHeader`, `createServerClient<Database>` |
| [src/middleware.ts:2,17](../../src/middleware.ts#L2) | middleware | `createClient`, `supabase.auth.getUser()` |
| [src/pages/dashboard.astro:10,20](../../src/pages/dashboard.astro#L10) | strona SSR | `.from("sessions").select(...)` |
| [src/pages/timeline.astro:8,18](../../src/pages/timeline.astro#L8) | strona SSR | `.from("sessions").select(...)` |
| [src/pages/session/[id].astro:13,23](../../src/pages/session/%5Bid%5D.astro#L13) | strona SSR | `.from("sessions").select(...)` |
| [src/pages/api/sessions/index.ts:32](../../src/pages/api/sessions/index.ts#L32) | API | `.from("sessions").insert(...)` |
| [src/pages/api/sessions/[id].ts:50,92,110,151](../../src/pages/api/sessions/%5Bid%5D.ts#L50) | API | cztery wywołania `.from("sessions")` |
| [src/pages/api/sessions/[id]/continue.ts:22](../../src/pages/api/sessions/%5Bid%5D/continue.ts#L22) | API | `.from("sessions")` |
| [src/pages/api/topics/index.ts:18,43](../../src/pages/api/topics/index.ts#L18) | API | `.from("topics")` |
| [src/pages/api/topics/[id].ts:34](../../src/pages/api/topics/%5Bid%5D.ts#L34) | API | `.from("topics")` |
| [src/pages/api/material-formats/index.ts:19,46](../../src/pages/api/material-formats/index.ts#L19) | API | `.from("material_formats")` |
| [src/pages/api/material-formats/[id].ts:34](../../src/pages/api/material-formats/%5Bid%5D.ts#L34) | API | `.from("material_formats")` |
| [src/pages/api/user-presets/index.ts:18](../../src/pages/api/user-presets/index.ts#L18) | API | `.from("user_presets")` |
| [src/pages/api/user-presets/[slot].ts:30](../../src/pages/api/user-presets/%5Bslot%5D.ts#L30) | API | `.from("user_presets")` |
| [src/pages/api/auth/{signin,signup,signout,oauth,callback}.ts:2](../../src/pages/api/auth/signin.ts#L2) | API | `createClient` + `supabase.auth.*` |

**Kanał 2 - sprzężenie z wygenerowanym typem `Database`** (kształt schematu dociera do UI):

- [src/lib/types.ts:1,25](../../src/lib/types.ts#L1) importuje `Database` i wyprowadza centralny typ widokowy aplikacji z surowego wiersza tabeli:
  ```ts
  type SessionRow = Database["public"]["Tables"]["sessions"]["Row"];      // types.ts:25
  export type SessionListItem = Pick<SessionRow, "id" | "started_at" | ...> & {...};  // types.ts:27
  ```
- `@/lib/types` jest następnie importowany przez **~25 plików komponentów/lib klienta** - np. [SessionList.tsx:3](../../src/components/session/SessionList.tsx#L3), [SessionTile.tsx:8](../../src/components/session/SessionTile.tsx#L8), [TimelineApp.tsx:14](../../src/components/timeline/TimelineApp.tsx#L14), [DayRow.tsx:6](../../src/components/timeline/DayRow.tsx#L6), [FocusRatingChartTooltip.tsx:4](../../src/components/dashboard/FocusRatingChartTooltip.tsx#L4), plus `src/lib/local/*` i `src/lib/timeline/*`. Tak więc **kształt kolumn Postgresa strukturalnie dociera do każdego widoku historii/osi czasu**.
- [src/pages/api/topics/[id].ts:5,29](../../src/pages/api/topics/%5Bid%5D.ts#L5) oraz [src/pages/api/material-formats/[id].ts:5,29](../../src/pages/api/material-formats/%5Bid%5D.ts#L5) budują obiekty aktualizacji typowane jako typ dostawcy `TablesUpdate<"topics">` / `TablesUpdate<"material_formats">`.

> **Uczciwa uwaga o granicy.** To są `import type` (usuwane przy buildzie), więc jest to sprzężenie **projektowe / strukturalne**, a nie przeciek do bundla klienta w runtime. *Runtime'owe* importy `@supabase/*` są w całości po stronie serwera (plumbing + middleware + API + frontmatter SSR); klient rozmawia z serwerem wyłącznie przez `fetch` (`src/lib/session/persistence.ts` importuje typy domenowe, nigdy Supabase). Klasyczny sygnał "to samo SDK wołane po obu stronach granicy klient/serwer" jest więc **nieobecny** - nie będę tego twierdził. Przeciek polega tu na (a) kształcie schematu wnikającym w typy UI oraz (b) kształtach zapytań/błędów dostawcy duplikowanych w warstwach serwera.

**Kanał 3 - taksonomia błędów Postgresa w warstwie API** (handlery znają surowe kody SQLSTATE):

- `error.code === "23505"` (naruszenie unikalności) ręcznie dekodowane w [topics/index.ts:49](../../src/pages/api/topics/index.ts#L49), [topics/[id].ts:42](../../src/pages/api/topics/%5Bid%5D.ts#L42), [material-formats/index.ts:52](../../src/pages/api/material-formats/index.ts#L52), [material-formats/[id].ts:42](../../src/pages/api/material-formats/%5Bid%5D.ts#L42).
- `error.code === "23514"` (naruszenie CHECK) w [user-presets/[slot].ts:44](../../src/pages/api/user-presets/%5Bslot%5D.ts#L44).
- Surowe `error.message` ze sterownika przekazywane do odpowiedzi JSON w ~15 handlerach (np. [sessions/index.ts:48](../../src/pages/api/sessions/index.ts#L48)).

**Kanał 4 - zduplikowana rekonstrukcja zapytania** ("kształt odczytu SessionListItem" budowany ręcznie):

- **Ten sam string select PostgREST** jest zduplikowany **dosłownie** w dwóch plikach:
  - [dashboard.astro:22-23](../../src/pages/dashboard.astro#L22)
  - [timeline.astro:20-22](../../src/pages/timeline.astro#L20)
  ```
  "id, started_at, energy_level, duration_seconds, focus_rating, ended_at, timer_mode, note,
   topic_id, material_format_id, topic:topics(name), material_format:material_formats(name)"
  ```
  Trzeci, węższy wariant jest w [session/[id].astro:25-27](../../src/pages/session/%5Bid%5D.astro#L25). Każda zmiana nazwy kolumny musi być poprawiona w każdej kopii i ręcznie zsynchronizowana z `SessionListItem`.

### Kandydat B - `@uiw/react-color`

- [ColorWheelDialog.tsx:2](../../src/components/timeline/ColorWheelDialog.tsx#L2) (`Wheel`, `ShadeSlider`, `hsvaToHex`, `hexToHsva`, `HsvaColor`), [useTimelineColors.ts:2](../../src/lib/timeline/useTimelineColors.ts#L2) (`validHex`). **2 pliki, jedna warstwa (klient timeline), jedna funkcja.** Odizolowane.

### Kandydat C - `recharts`

- Tylko [FocusRatingChart.tsx:1](../../src/components/dashboard/FocusRatingChart.tsx#L1), `client:only`. **1 plik, izolowany.** To nie jest przeciek.

---

## Krok 2 - Klasyfikacja i wybór #1

| Oś | Supabase | `@uiw/react-color` | `recharts` |
| --- | --- | --- | --- |
| Pliki / warstwy dotknięte | **~28 plików, 5 warstw** | 2 pliki, 1 warstwa | 1 plik, 1 warstwa |
| Sprzężenie typów z UI | **tak** (schemat → `SessionListItem` → ~25 plików) | nie | nie |
| Duplikacja błędów/zapytań dostawcy | **tak** (kody SQLSTATE + string select x2) | nie | nie |
| Koszt/ryzyko wymiany dziś | **wysokie** (auth + persystencja + RLS + typy) | niskie | niskie |
| Zadeklarowana wymienialność? | słabo (starter "bundled"; nie zablokowane w PRD) | nie | nie |

**Wybór: Supabase to przeciek #1.** To jedyna zależność, która (a) jest obecna w każdej warstwie serwera *oraz* (b) strukturalnie dociera do klienta przez wygenerowane typy *oraz* (c) duplikuje kształty zapytań/błędów dostawcy w wielu plikach. Pozostałe dwie są jednofunkcyjne, jednowarstwowe i już praktycznie odizolowane. Reszta planu projektuje jeden ACL dla szwu Supabase. `@uiw/react-color` i `recharts` nie wymagają działań.

---

## Krok 3 - Diagnoza

**3a. Duplikacja (dosłowna).** Kształt odczytu `sessions` jest rekonstruowany ręcznie na dwóch stronach:

```
dashboard.astro:22   .select("id, started_at, energy_level, duration_seconds, focus_rating, ended_at,
                               timer_mode, note, topic_id, material_format_id,
                               topic:topics(name), material_format:material_formats(name)")
timeline.astro:20    .select("id, started_at, energy_level, duration_seconds, focus_rating, ended_at,
                               timer_mode, note, topic_id, material_format_id,
                               topic:topics(name), material_format:material_formats(name)")
```
Te stringi muszą pozostać bajtowo identyczne wzajemnie *oraz* w synchronizacji z `SessionListItem` ([types.ts:27](../../src/lib/types.ts#L27)) - trzy źródła prawdy dla jednego odczytu, żadne nie egzekwuje pozostałych.

**3b. Przeciek granicy - kształt schematu do warstwy widoku.** `SessionListItem` nie jest typem domenowym; to `Pick` z wygenerowanego wiersza Postgresa ([types.ts:25-27](../../src/lib/types.ts#L25)). Płynie do ~25 plików UI/lib. Migracja zmieniająca nazwę lub typ kolumny `sessions` po cichu przetypuje komponenty timeline i dashboard. UI zależy od *fizycznego schematu* bazy, a nie od kontraktu domenowego.

**3c. Przeciek granicy - taksonomia błędów dostawcy w handlerach.** Warstwa API ręcznie dekoduje SQLSTATE Postgresa ([topics/index.ts:49](../../src/pages/api/topics/index.ts#L49) `23505`, [user-presets/[slot].ts:44](../../src/pages/api/user-presets/%5Bslot%5D.ts#L44) `23514`) i przekazuje surowe `error.message` sterownika do klientów. "A topic with that name already exists" to fakt *domenowy* wyrażony dziś jako magiczna stała Postgresa, powtórzona w czterech plikach.

**3d. Intencja vs. kod.** arch.md reklamuje *"One factory ... returns null when unconfigured and all callers handle it"* ([arch.md:574](../foundation/arch.md#L574)). To prawda, ale płytka: fabryka ukrywa *konstrukcję*, więc każde z ~18 miejsc wywołania i tak powtarza `const supabase = createClient(...); if (!supabase) return 500;` i potem mówi surowym PostgREST. Deklarowana intencja ("jeden szew") jest spełniona tylko dla okablowania, nie dla kontraktu danych/błędów dostawcy.

---

## Krok 4 - Projekt ACL

Wprowadź domenowy szew dostępu do danych pod **`src/lib/db/`**. Dwie idee:

1. **Typy domenowe przestają dziedziczyć z `Database`.** `SessionListItem` staje się ręcznie pisanym kontraktem domenowym; *mapowanie* z wiersza Postgresa żyje w jednym pliku adaptera.
2. **Wąski port repozytorium** na agregat; reszta aplikacji zależy od portu, nigdy od `@supabase/*` czy `@/db/database.types`.

### 4a. Domenowe value objecty (bez zależności od dostawcy)

`src/lib/types.ts` - usuń import `Database`; zdefiniuj kształt, którego domena faktycznie używa:

```ts
// src/lib/types.ts  (po)  -- ZERO importu @/db/database.types
export interface SessionListItem {
  id: string;
  started_at: string;
  ended_at: string | null;
  energy_level: EnergyLevel;
  duration_seconds: number | null;
  focus_rating: number | null;
  timer_mode: Mode;
  note: string | null;
  topic_id: string | null;
  material_format_id: string | null;
  topic: { name: string } | null;
  material_format: { name: string } | null;
}
```
Lista pól jest identyczna z dzisiejszym `Pick`, więc żaden plik UI poniżej nie zmienia kształtu - zmienia się tylko *źródło* typu z "wiersz Postgresa" na "kontrakt domenowy". Jeden mapper (4c) utrzymuje zgodność, pilnowaną przez type checker.

### 4b. Wąski port

```ts
// src/lib/db/ports.ts  -- domenowe, bez dostawcy
export type RepoResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: RepoError };

export type RepoError =
  | { kind: "duplicate_name" }      // było Postgres 23505
  | { kind: "check_violation" }     // było Postgres 23514
  | { kind: "not_found" }
  | { kind: "unconfigured" }        // było createClient() === null
  | { kind: "unknown"; detail: string };

export interface SessionRepository {
  listForUser(userId: string, limit?: number): Promise<RepoResult<SessionListItem[]>>;
  getForRunner(id: string, userId: string): Promise<RepoResult<SessionRunnerRow | null>>;
  create(userId: string, input: CreateSessionInput): Promise<RepoResult<{ id: string; started_at: string }>>;
  end(id: string, userId: string, patch: EndSessionPatch): Promise<RepoResult<"updated" | "conflict">>;
  update(id: string, userId: string, patch: UpdateSessionPatch): Promise<RepoResult<"updated" | "conflict">>;
  continueAsCountUp(id: string, userId: string): Promise<RepoResult<"updated" | "conflict">>;
}
```
Siostrzane porty `CatalogRepository` (topics + material_formats: `list`, `create`, `rename`, `archive`), `PresetRepository` oraz `AuthGateway` (`getUser`, `signInWithPassword`, `signUp`, `signOut`, `signInWithOAuth`, `exchangeCodeForSession`) mają ten sam kształt. Wywołujący zależą tylko od tych portów.

### 4c. Adapter (JEDYNA grupa plików świadoma dostawcy)

```
src/lib/db/
  ports.ts            # interfejsy + RepoResult/RepoError  (bez dostawcy)
  supabase/
    client.ts         # przeniesione 1:1 z src/lib/supabase.ts (createServerClient)
    columns.ts        # export const SESSION_LIST_COLUMNS = "id, started_at, ..."  (JEDEN string select)
    errors.ts         # mapPgError(error): RepoError   -- 23505->duplicate_name, 23514->check_violation
    mappers.ts        # rowToSessionListItem(row): SessionListItem
    sessionRepo.ts    # implementuje SessionRepository przez supabase.from("sessions")
    catalogRepo.ts    # implementuje CatalogRepository
    presetRepo.ts     # implementuje PresetRepository
    authGateway.ts    # implementuje AuthGateway przez supabase.auth.*
    index.ts          # fabryka: makeRepositories(headers, cookies) -> { sessions, catalog, presets, auth } | null
```

Pseudokod adaptera (kształt błędu + zapytania uchwycony raz):

```ts
// supabase/columns.ts
export const SESSION_LIST_COLUMNS =
  "id, started_at, energy_level, duration_seconds, focus_rating, ended_at, timer_mode, note, " +
  "topic_id, material_format_id, topic:topics(name), material_format:material_formats(name)";

// supabase/errors.ts
export function mapPgError(e: { code?: string; message: string }): RepoError {
  if (e.code === "23505") return { kind: "duplicate_name" };
  if (e.code === "23514") return { kind: "check_violation" };
  return { kind: "unknown", detail: e.message };
}

// supabase/sessionRepo.ts
async listForUser(userId, limit) {
  const q = this.sb.from("sessions").select(SESSION_LIST_COLUMNS)
             .eq("user_id", userId).order("started_at", { ascending: false });
  const { data, error } = limit ? await q.limit(limit) : await q;
  if (error) return { ok: false, error: mapPgError(error) };
  return { ok: true, value: data.map(rowToSessionListItem) };
}
```

Wywołujący stają się wolni od dostawcy. Przykład - `dashboard.astro`:

```ts
const repos = makeRepositories(Astro.request.headers, Astro.cookies);
const res = repos ? await repos.sessions.listForUser(user.id, 50)
                  : { ok: false, error: { kind: "unconfigured" } } as const;
const sessions = res.ok ? res.value : [];
const dbError  = res.ok ? null : messageFor(res.error);   // mapowanie domena->tekst, nie error.message
```

Przykład - `topics/[id].ts` PATCH:

```ts
const res = await repos.catalog.rename("topics", id, user.id, parsed.data);
if (!res.ok && res.error.kind === "duplicate_name")
  return Response.json({ error: "A topic with that name already exists" }, { status: 409 });
```
Magiczne `23505` i string komunikatu żyją teraz w dokładnie jednym miejscu każdy (`errors.ts` + mała mapa komunikatów).

---

## Krok 5 - Dowód izolacji + before/after

**Wymiana Supabase po ACL** dotyka wyłącznie `src/lib/db/supabase/**` (+ okablowanie `src/lib/db/index.ts`). **Nie** dotyka:

- **Tabel / RLS** - bez zmian; `supabase/migrations/**` jest ortogonalne.
- **Kontraktów wire** - odpowiedzi JSON API (`{ id, started_at }`, `{ ok: true }`, `{ error }`) są już ręcznie kształtowane w handlerach i pozostają identyczne.
- **UI** - komponenty importują `SessionListItem` z `@/lib/types`, który już nie odwołuje się do dostawcy. Zero edycji komponentów.
- **Słownika domenowego** - `EnergyLevel`, `Mode`, `SessionListItem` są wolne od dostawcy.

**Before → after (duplikacja):**

| Zagadnienie | Before | After |
| --- | --- | --- |
| String select `sessions` | 2 dosłowne kopie (dashboard.astro:22, timeline.astro:20) + 1 wariant | jedna stała `SESSION_LIST_COLUMNS` |
| Postgres `23505` | 4 handlery | jeden `mapPgError` |
| Źródło typu `SessionListItem` | `Database["public"]["Tables"]["sessions"]["Row"]` | ręcznie pisany typ domenowy + jeden mapper |
| `createClient(...) + null check` | ~18 miejsc wywołania | jedna fabryka `makeRepositories()` |

**Before → after (warstwa widoku):** UI otrzymuje gotowe dane domenowe. `SessionList`/`TimelineApp` już przyjmują prop `SessionListItem[]` - po ACL ten typ jest kontraktem *domenowym*, a nie projekcją wiersza Postgresa, więc zmiana nazwy kolumny nie może już po cichu przetypować osi czasu.

**Pytania kontraktowe rozstrzygnięte z dokumentacji dostawcy (kodować w ACL, nie w warstwie API):**

- **Kod naruszenia unikalności** - Postgres/PostgREST zwraca naruszenia unikalności jako SQLSTATE `23505`; naruszenia CHECK jako `23514`. Należą do `supabase/errors.ts`. Jeśli dostawca się zmieni, tylko ten plik re-mapuje.
- **Semantyka `.maybeSingle()` vs `.single()`** (null vs. wyjątek przy zero wierszy) to kwestia PostgREST; hermetyzuj wybór w zwracanym typie metody repo (`... | null`), by wywołujący rozgałęział na stan domenowy, nie na zachowanie sterownika.

---

## Krok 6 - Weryfikacja i plan faz

**Kryterium sukcesu (sprawdzalne greppem):** po refaktorze,
```
grep -rE "@supabase/|@/db/database\.types|\.from\(|error\.code|createServerClient" src \
  | grep -v "src/lib/db/"
```
zwraca **nic** (dziś zwraca ~28 plików w middleware, stronach i api).

**Pliki znające Supabase dziś → po:**

| Warstwa | Dziś | Po |
| --- | --- | --- |
| plumbing | supabase.ts | `src/lib/db/supabase/client.ts` (przeniesione) |
| middleware | middleware.ts (`.auth.getUser`) | port `AuthGateway` |
| strony SSR | dashboard / timeline / session/[id] | brak (używają `SessionRepository`) |
| trasy API | ~14 plików (`.from`, `error.code`, `TablesUpdate`) | brak (używają repo) |
| typy domenowe | types.ts (import `Database`) | brak (bez dostawcy) |
| **łącznie świadomych dostawcy** | **~28 plików** | **tylko `src/lib/db/supabase/**`** |

**Fazowanie** (zgodne z konwencją per-change projektu: jeden folder zmiany pod `context/changes/<id>/` z plan → implement → tests; każda faza zielona i rozmiaru PR):

1. **Faza 1 - odsprzężenie typów (zero zmiany zachowania).** Przepisz `SessionListItem` jako ręczny typ ([types.ts:25-27](../../src/lib/types.ts#L25)); dodaj mapper `rowToSessionListItem` + `SESSION_LIST_COLUMNS`; skieruj dashboard/timeline na stałą + mapper. Weryfikacja: `npm run lint`, `npm run build`, `npm test`, istniejące e2e dashboard/timeline zielone.
2. **Faza 2 - `SessionRepository`.** Wprowadź port + adapter Supabase; przenieś odczyty/zapisy `sessions` (3 strony SSR + `api/sessions/*`) za port. To największa powierzchnia przecieku. Weryfikacja: testy kontraktowe API (`tests/integration/api`) bez zmian; suity pgTAP RLS (`npm run db:test`) nienaruszone (RLS bez zmian).
3. **Faza 3 - `CatalogRepository` + `PresetRepository`.** Przenieś handlery `topics`/`material_formats`/`user_presets` za porty; scentralizuj `23505`/`23514` w `mapPgError`; usuń importy `TablesUpdate`.
4. **Faza 4 - `AuthGateway`.** Przenieś `middleware.ts` + `api/auth/*` na gateway; wycofaj `src/lib/supabase.ts` (teraz `src/lib/db/supabase/client.ts`). Uruchom powyższą bramkę grep jako kontrolę wyjścia.

**Kompromis, uczciwie (simplicity-first).** Pełny czteroportowy hexagon to więcej struktury niż ściśle potrzebuje 3-tygodniowy solowy MVP. Jeśli zakres trzeba zawęzić, **sama Faza 1 daje największą wartość przy najniższym ryzyku** (zabija sprzężenie typów w ~25 plikach UI i zduplikowany string select) i może pojechać niezależnie; Fazy 2-4 to zysk wymienialności dostawcy i mogą poczekać do faktycznego drugiego backendu lub presji migracji. Nie buduj portów spekulatywnie ponad to, czego wymaga dana faza.

---

## Podsumowanie

Supabase to najgorzej przeciekająca zależność PomoSapiens: jest obecna w pięciu warstwach (~28 plików) i przecieka czterema kanałami - wywołania SDK/`.from()` w middleware, stronach SSR i trasach API; wygenerowany typ `Database` docierający strukturalnie do ~25 plików UI przez `SessionListItem`; ręcznie dekodowane kody SQLSTATE Postgresa (`23505`, `23514`) w warstwie API; oraz dosłownie zduplikowany string select PostgREST w `dashboard.astro` i `timeline.astro`. Istniejący szew "jednej fabryki" ([arch.md:574](../foundation/arch.md#L574)) ukrywa tylko konstrukcję, więc kontrakty danych i błędów dostawcy nadal wyciekają wszędzie. Rozwiązaniem jest domenowy ACL pod `src/lib/db/`: porty repozytoriów wolne od dostawcy plus jeden adapter Supabase, który posiada klienta, jedyną stałą `SESSION_LIST_COLUMNS`, mappery wiersz→domena i mapę SQLSTATE→błąd domenowy. Po nim `SessionListItem` jest kontraktem domenowym (a nie projekcją wiersza Postgresa), UI jest nietknięte przez zmiany nazw kolumn, a wymiana backendu dotyka wyłącznie `src/lib/db/supabase/**` - sprawdzalnie greppem. Rekomendowany, uczciwy zakres to najpierw wdrożyć Fazę 1 (odsprzężenie typów) dla największego niskoryzykownego zysku, a pozostałe porty traktować jako ubezpieczenie wymienialności dodawane pod realną presją, a nie spekulatywnie.
