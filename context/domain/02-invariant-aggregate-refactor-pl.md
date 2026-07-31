---
title: PomoSapiens - Plan refaktoru agregatu-strażnika niezmiennika
created: 2026-07-28
type: refactor-plan
---

# PomoSapiens - Plan refaktoru agregatu-strażnika niezmiennika

> To **plan**, nie implementacja. Żaden kod produkcyjny nie jest tu zmieniany. Każde twierdzenie jest cytowane
> do `plik:linia` i zweryfikowane z działającym kodem. Nowe nazwy oznaczono **NOWE**.
> Dokument towarzyszący dla [01-domain-distillation.md](01-domain-distillation.md); tutaj zawężamy się do
> jednego niezmiennika i projektujemy agregat, który powinien go posiadać.

---

## KROK 0 - Odkryty kontekst

**Przeczytane źródła wymagań:** [prd.md](../foundation/prd.md) (zablokowany, FR-001..FR-018),
[arch.md](../foundation/arch.md) (migawka architektury 2026-07-16), [roadmap.md](../foundation/roadmap.md)
(S-00..S-14, wszystkie dostarczone poza S-09), [lessons.md](../foundation/lessons.md) (L-01..L-08, najbliższy
odpowiednik rejestru kontraktów w tym projekcie).

**Stack i gdzie żyje logika biznesowa:** Astro 6 SSR + wyspy React 19 na Cloudflare Workers; Supabase
(Postgres + RLS + Auth). Reguły domenowe są rozsmarowane po czterech warstwach, a co kluczowe - po **dwóch
backendach persystencji**:

- **Persystencja / niezmienniki DB**: `supabase/migrations/*.sql` (schemat, CHECK, RLS, kolumny generowane).
- **Granica żądania (zalogowany)**: handlery `src/pages/api/**` + schematy zod `src/lib/schemas/*.ts`.
- **Logika domenowa po stronie klienta**: `src/lib/timer/`, `src/lib/session/`, oraz drugi backend `src/lib/local/`.
- **Ścieżka anonimowa to pełna druga warstwa persystencji**, nie cache: niezalogowany odwiedzający uruchamia
  całą pętlę przechwytywania na `localStorage` ([arch.md:16](../foundation/arch.md#L16)). Każda reguła
  domenowa musi więc zachodzić w *dwóch* miejscach, albo nie zachodzi wcale.

---

## KROK 1 - Niezmienniki biznesowe (identyfikacja)

Reguły, które MUSZĄ być zawsze prawdziwe w tej domenie, wyciągnięte z dokumentów ORAZ z kodu, każda cytowana.

| # | Niezmiennik (musi zawsze zachodzić) | Źródło |
| --- | --- | --- |
| **INV-1** | Sesja należy do dokładnie jednego użytkownika i nigdy nie jest widoczna dla innego. | NFR prywatności [prd.md:131](../foundation/prd.md#L131); Kontrola dostępu [prd.md:156](../foundation/prd.md#L156) |
| **INV-2** | Poziom energii jest zawsze obecny w sesji (jedyne wymagane pole przed-sesyjne). | FR-009 [prd.md:92](../foundation/prd.md#L92) |
| **INV-3** | Sesja jest **kończona dokładnie raz**: przechodzi z "w toku" (`ended_at` NULL) do "zakończona" (non-NULL) jeden raz; zakończona sesja nie może być zakończona ponownie ani cofnięta. | "Write-once end" [arch.md:480](../foundation/arch.md#L480); L-01 [lessons.md:9](../foundation/lessons.md#L9) |
| **INV-4** | Zapisany czas trwania to **rzeczywisty czas zegara ściennego** (`ended_at - started_at`), nawet przy wczesnym zatrzymaniu, i jest zatem nieujemny. | FR-012 [prd.md:101](../foundation/prd.md#L101); US-01 AC [prd.md:62](../foundation/prd.md#L62) |
| **INV-5** | Zapis zakończenia jest **atomowy** z przechwyceniem oceny + notatki (jedno przejście pieczętuje punkt danych). | "rating -> saved ... PATCH / local write succeeds" [arch.md:548](../foundation/arch.md#L548) |
| **INV-6** | Ocena skupienia to 1..5 lub NULL (pominięcie); nigdy 0, 6 ani ułamkowa. | FR-013 [prd.md:106](../foundation/prd.md#L106) |
| **INV-7** | `ended_at` jest prawdopodobne (bez manipulacji zegarem daleko w przyszłość/przeszłość). | "plausibility window" [arch.md:480](../foundation/arch.md#L480) |
| **INV-8** | Tryb `count_up` => planowane czasy trwania NULL przy insercie; preset => oba non-NULL. | [arch.md:302](../foundation/arch.md#L302) |
| **INV-9** | Tryb timera jest jednym z `{preset_1, preset_2, preset_3, count_up}`. | FR-010 [prd.md:94](../foundation/prd.md#L94) |
| **INV-10** | "Continue" w locie konwertuje na count-up tylko sesję preset **wciąż działającą**. | S-10 [arch.md:481](../foundation/arch.md#L481) |

---

## KROK 2 - Klasyfikacja i wybór #1

Każdy niezmiennik oceniony na trzech osiach: **(a) rdzeniowość** (dla sensu istnienia produktu), **(b) rozsmarowanie**
(w ilu warstwach/plikach żyje), **(c) egzekucja** (realnie egzekwowany / tylko deklarowany / naruszalny).

| # | (a) Rdzeniowy? | (b) Rozsmarowanie | (c) Egzekucja | Uwagi |
| --- | --- | --- | --- | --- |
| INV-1 | Najwyższa (prywatność to twarda bariera) | DB + API + testy | **Silna.** Polityki RLS per-operacja [migration:134-149](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L134) + `.eq("user_id")` + sieć pgTAP. | Rdzeniowa, ale *najlepiej* strzeżona reguła. Nie cel refaktoru. |
| INV-2 | Wysoka (energia to nośne wejście) | DB + zod + klient | **Silna** na remote (`NOT NULL` [migration:91](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L91) + zod [session.ts:4](../../src/lib/schemas/session.ts#L4)). | Solidna po stronie serwera. |
| INV-3 | **Najwyższa** (pieczętuje każdy punkt danych) | **6+ miejsc** (patrz KROK 3) | **Niespójna.** Egzekwowana na remote PATCH [\[id\].ts:54](../../src/pages/api/sessions/[id].ts#L54); **nieobecna na ścieżce anonimowej** [localSessions.ts:47](../../src/lib/local/localSessions.ts#L47); **brak ograniczenia DB**. | **NAJSILNIEJSZY KANDYDAT.** |
| INV-4 | Wysoka | generowana kolumna DB | **Silna** na remote (GENERATED [migration:85](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L85)); **wyliczana w JS, niestrzeżona** na anon. | Zależny od przejścia INV-3. |
| INV-5 | Wysoka | API + local store | Remote: jeden `UPDATE` [\[id\].ts:51](../../src/pages/api/sessions/[id].ts#L51). Anon: jeden `setItems` [localSessions.ts:51](../../src/lib/local/localSessions.ts#L51). | Atomowy z konstrukcji, niemodelowany. |
| INV-6 | Średnio-wysoka | DB + zod + local | Silna remote (CHECK [migration:92](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L92) + zod [session.ts:26](../../src/lib/schemas/session.ts#L26)); **brak kontroli zakresu na anon** [localSessions.ts:49](../../src/lib/local/localSessions.ts#L49). | Zależny od zapisu INV-3. |
| INV-7 | Średnia | tylko API | Tylko PATCH [\[id\].ts:45](../../src/pages/api/sessions/[id].ts#L45); nieobecny na PUT (celowo) i na anon. | Strażnik dla INV-3. |
| INV-8 | Średnia | tylko API | POST odrzuca [index.ts:24-30](../../src/pages/api/sessions/index.ts#L24); **brak CHECK DB**, rozluźniony przez continue [continue.ts:23](../../src/pages/api/sessions/[id]/continue.ts#L23). | Już ujęty jako #2 w [01](01-domain-distillation.md). |
| INV-9 | Średnia | DB + zod | zod enum [session.ts:9](../../src/lib/schemas/session.ts#L9); DB dopuszcza też NULL [migration:95](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L95). | Drobny dryf. |
| INV-10 | Średnia | API + klient | strażnik continue [continue.ts:26](../../src/pages/api/sessions/[id]/continue.ts#L26). | Wąski. |

### Wybrany #1: INV-3 (z INV-4, INV-5, INV-6, INV-7 jako zależnymi)

**Wybrany niezmiennik, ujęty precyzyjnie:**

> **Zakończenie sesji to pojedyncze, jednorazowe (write-once), terminalne przejście produkujące poprawny
> punkt danych.** Sesja jest tworzona jako "w toku" (`ended_at` = NULL) i przechodzi w "zakończona"
> (`ended_at` ustawione) **dokładnie raz**. To pojedyncze przejście jest **atomowe** z przechwyceniem oceny
> skupienia i notatki; produkuje **nieujemny rzeczywisty czas trwania** i ocenę **1..5 albo pominięcie**.
> Żadna ścieżka nie może zakończyć sesji dwa razy, cofnąć zakończonej sesji do "w toku", przesunąć `ended_at`
> nieprawdopodobnie, ani zapisać oceny poza zakresem.

**Dlaczego jest najbardziej rdzeniowy I najsłabiej egzekwowany (przecięcie, o które prosi brief):**

- **Najbardziej rdzeniowy.** Sesja to atomowa jednostka całego produktu: "PomoSapiens treats every focus session
  as a data point" [prd.md:139](../foundation/prd.md#L139). North star to dosłownie "log first ... session
  end-to-end" [roadmap.md:24](../foundation/roadmap.md#L24). Każda analityka, którą produkt obiecuje (Core
  subdomain w [01](01-domain-distillation.md)), jest wiarygodna tylko na tyle, na ile wiarygodne jest przejście
  kończące, które pieczętuje każdy punkt. Podwójne zakończenie, wskrzeszona sesja lub sfabrykowany czas trwania
  po cichu psują dokładnie te wejścia, na których produkt ma operować.

- **Najsłabiej / najbardziej niespójnie egzekwowany.** To luka, którą [01](01-domain-distillation.md) oznaczyła
  jako "ENFORCED", bo audytowała tylko ścieżkę zalogowaną. Poszerzenie perspektywy na **oba backendy** pokazuje,
  że niezmiennik jest:
  1. **Egzekwowany przez rozproszoną dyscyplinę, nie modelowanego właściciela, na ścieżce remote.** Reguła
     przetrwa tylko dlatego, że cztery niepowiązane mechanizmy przypadkiem się zgrywają: filtr PATCH
     `.is("ended_at", null)` [\[id\].ts:54](../../src/pages/api/sessions/[id].ts#L54), okno prawdopodobieństwa
     [\[id\].ts:45](../../src/pages/api/sessions/[id].ts#L45), generowana kolumna `duration_seconds`
     [migration:85](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L85) oraz granice zod.
     Lekcja L-01 [lessons.md:9](../foundation/lessons.md#L9) istnieje właśnie dlatego, że to *dyscyplina do
     zapamiętania przy każdym endpoincie*, nie gwarancja dostarczana przez jeden obiekt.
  2. **Zupełnie niestrzeżony na ścieżce anonimowej.** `endLocalSession`
     [localSessions.ts:47-52](../../src/lib/local/localSessions.ts#L47) nadpisuje *dowolny* wiersz - także już
     zakończony - bez kontroli `ended_at IS NULL`, bez okna prawdopodobieństwa i bez kontroli zakresu oceny
     [localSessions.ts:49](../../src/lib/local/localSessions.ts#L49). **Jedyne**, co powstrzymuje podwójne
     zakończenie u anonimowego odwiedzającego, to stan fazy klienckiego `SessionRunner` - **UI jest jedynym
     strażnikiem** (patrz KROK 3).
  3. **Nieegzekwowany przez żadne ograniczenie DB.** Polityka RLS UPDATE sprawdza tylko `user_id`
     [migration:142-145](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L142); pozwala
     nadpisać `ended_at` już zakończonego wiersza. Własność write-once to *filtr aplikacyjny*, odwoływalny przez
     dowolną przyszłą ścieżkę kodu lub wywołanie `service_role`. Nie ma CHECK, że `ended_at >= started_at`.
  4. **Rozsmarowany po 6+ miejscach** (KROK 3), przy czym jedna ścieżka (PUT) celowo się wypisuje, a inna (local)
     wypisuje się po cichu.

INV-1 (prywatność) jest bardziej rdzeniowy w abstrakcji, ale to *najlepiej* egzekwowana reguła w systemie, więc
oblewa połowę testu "najsłabiej egzekwowany". INV-3 jest jedynym niezmiennikiem, który jest jednocześnie
najwyższej klasy rdzeniowy i realnie naruszalny dziś. **Zostaje wybrany.**

---

## KROK 3 - Diagnoza: gdzie reguła żyje dziś

Reguła przejścia kończącego (INV-3 + zależne) jest rozproszona po tych miejscach. "Strażnik obecny" znaczy, że
miejsce faktycznie egzekwuje write-once / poprawność; "strażnik nieobecny" znaczy, że polega na czymś innym.

| # | Miejsce | Co robi | Status strażnika |
| --- | --- | --- | --- |
| G-1 | `PATCH /api/sessions/[id]` [\[id\].ts:49-56](../../src/pages/api/sessions/[id].ts#L49) | Kończy sesję zalogowaną: pojedynczy `UPDATE` `{ended_at, focus_rating, note}` filtrowany `.is("ended_at", null)`; 409 gdy brak wiersza. | **Obecny** (write-once + atomowy). Prawdopodobieństwo w [\[id\].ts:45](../../src/pages/api/sessions/[id].ts#L45). |
| G-2 | `POST /api/sessions/[id]/continue` [continue.ts:21-28](../../src/pages/api/sessions/[id]/continue.ts#L21) | Konwertuje running preset -> count_up, filtr `.is("ended_at", null)`. | **Obecny** (INV-10). |
| G-3 | `PUT /api/sessions/[id]` [\[id\].ts:69-133](../../src/pages/api/sessions/[id].ts#L69) | Edytuje już zakończony wiersz; przelicza `ended_at` z edytowanego czasu trwania. | **Celowo brak write-once/prawdopodobieństwa** [\[id\].ts:1-5](../../src/pages/api/sessions/[id].ts#L1) - edytuje zakończony wiersz z założenia. Rewaliduje czas trwania >= 1 przez zod [session.ts:42](../../src/lib/schemas/session.ts#L42). |
| G-4 | `endLocalSession` (anonimowy) [localSessions.ts:47-52](../../src/lib/local/localSessions.ts#L47) | Kończy sesję anonimową mapując po itemach i nadpisując pasujący id. | **Nieobecny.** Brak kontroli `ended_at IS NULL`, prawdopodobieństwa, zakresu oceny. Nadpisuje zakończony wiersz po cichu. |
| G-5 | `SessionRunner.submitRating` [SessionRunner.tsx:136-151](../../src/components/session/SessionRunner.tsx#L136) | Zakończenie klienckie: przerywa gdy `stoppedAtMs === null`, inaczej woła `persistEnd`. | **Tylko UI.** Ten `if` to *jedyny* strażnik na ścieżce anon (G-4 nie dodaje żadnego). |
| G-6 | `resolveSessionPageAccess` [access.ts:12-18](../../src/lib/session/access.ts#L12) | Przekierowuje `/session/[id]` gdy wiersz brakuje lub już zakończony. | Wyprowadzenie statusu po stronie odczytu; nie strażnik zapisu. |
| G-7 | SELECT w `dashboard.astro` [dashboard.astro:23](../../src/pages/dashboard.astro#L23) | Czyta `ended_at`; status wiersza ("W toku" vs "Zakończona") wyprowadzany po stronie klienta. | Strona odczytu; musi zgadzać się z regułą zapisu, ale jej nie egzekwuje. |

**Tryby awarii, które to rozproszenie dziś dopuszcza:**

1. **Anonimowe podwójne zakończenie / wskrzeszenie.** Nic poza stanem React nie powstrzymuje wywołania
   `endLocalSession` dwa razy ani na już zakończonym wierszu, po cichu przepisując ocenę, notatkę i `ended_at`.
   Zwietrzała druga karta odpalająca `endSession` pieczętuje punkt ponownie innymi danymi. **Klient jest jedynym
   strażnikiem** (G-4 + G-5).
2. **Ocena anonimowa poza zakresem.** `endLocalSession(id, { focus_rating })` przyjmuje dowolny `number`
   [localSessions.ts:49](../../src/lib/local/localSessions.ts#L49); żaden bound `1..5` nie odzwierciedla serwerowego
   CHECK (INV-6 naruszalny dla anon).
3. **Cichy dryf, nie fail-fast.** Ścieżka remote *zawodzi głośno* przy drugim zakończeniu (409, G-1); ścieżka
   anonimowa *połyka i jedzie dalej* - po prostu nadpisuje. Ta sama reguła domenowa, przeciwne zachowanie awaryjne.
   To dokładnie anty-wzorzec "błąd połknięty zamiast zatrzymania operacji", który brief bierze na cel.
4. **Brak gwarancji serwera-jako-źródła-prawdy.** Nawet na ścieżce remote write-once to filtr aplikacyjny, nie
   ograniczenie; przyszły endpoint, który zapomni `.is("ended_at", null)` (dokładnie zagrożenie L-01), ponownie
   otwiera dziurę bez żadnego pokrycia testami, chyba że ktoś zapamięta dyscyplinę.

---

## KROK 4 - Projekt agregatu-strażnika

**Cel:** uczynić **jeden** obiekt jedynym miejscem egzekucji przejścia kończącego, tak by oba backendy przez
niego szły i ani klient, ani przyszły endpoint nie mógł być jedynym strażnikiem. To **refaktor** (wprowadzenie
szwu domenowego nad istniejącym zachowaniem), nie przepisanie: ścieżka remote zachowuje swój zapis do DB,
ścieżka anon zachowuje localStorage - przestają jedynie każda z osobna decydować o regule.

### 4.1 Korzeń agregatu: `FocusSession` (NOWE)

Czysty, niezależny od backendu obiekt domenowy w `src/lib/domain/focusSession.ts` (**NOWE**). Trzyma stan
sesji i wystawia **metody przejść z preconditions**. Nielegalne przejścia rzucają **nazwane błędy domenowe**
(nigdy nie mutują po cichu).

```
// src/lib/domain/focusSession.ts   (NOWE - pseudokod, nie ostateczny)

type SessionStatus = "in_progress" | "ended";

class FocusSession {
  readonly id: string;
  readonly userId: string | null;        // null = anonimowy
  readonly startedAtMs: number;
  private endedAtMs: number | null;
  private energy: EnergyLevel;            // INV-2 sprawdzone przy konstrukcji
  private timerMode: Mode;                // INV-9
  private plannedFocusSeconds: number | null;
  private plannedBreakSeconds: number | null;
  private focusRating: number | null;
  private note: string | null;

  get status(): SessionStatus { return this.endedAtMs === null ? "in_progress" : "ended"; }

  // ---- strzeżone przejście (INV-3 + INV-4 + INV-5 + INV-6 + INV-7) ----
  end({ endedAtMs, focusRating, note, nowMs }): void {
    if (this.status === "ended")            throw new SessionAlreadyEndedError(this.id);   // INV-3
    if (endedAtMs < this.startedAtMs)       throw new NegativeDurationError(this.id);      // INV-4
    if (!isPlausibleEnd(endedAtMs, nowMs))  throw new ImplausibleEndTimeError(this.id);    // INV-7
    if (focusRating !== null && !(focusRating >= 1 && focusRating <= 5 && Number.isInteger(focusRating)))
                                            throw new InvalidFocusRatingError(focusRating); // INV-6
    // atomowe przejście w pamięci; repozytorium persystuje cały obiekt raz (INV-5)
    this.endedAtMs = endedAtMs;
    this.focusRating = focusRating;
    this.note = normalizeNote(note);        // "" -> null, trim, limit 500
  }

  // ---- konwersja w locie (INV-10) ----
  continueAsCountUp(): void {
    if (this.status === "ended")            throw new SessionAlreadyEndedError(this.id);
    if (this.timerMode === "count_up")      throw new NotAPresetSessionError(this.id);
    this.timerMode = "count_up";
    this.plannedFocusSeconds = null;        // planned_break zachowany celowo (INV-8 rozluźniony, arch.md:302)
  }

  // ---- korygująca edycja już zakończonego wiersza (ścieżka PUT) ----
  edit({ durationSeconds, energy, topicId, materialFormatId, focusRating, note }): void {
    if (this.status !== "ended")            throw new CannotEditRunningSessionError(this.id);
    if (durationSeconds < 1 || durationSeconds > 24*3600) throw new InvalidDurationError(durationSeconds);
    this.endedAtMs = this.startedAtMs + durationSeconds * 1000;   // started_at trzymany na stałe
    // ... przypisz zwalidowane pola
  }

  toSnapshot(): FocusSessionSnapshot { /* czyste dane dla repozytorium */ }
  static fromSnapshot(s: FocusSessionSnapshot): FocusSession { /* rehydracja + ponowna kontrola INV-2, INV-9 */ }
}
```

**Nazwane błędy domenowe** (**NOWE**, `src/lib/domain/errors.ts`): `SessionAlreadyEndedError`,
`NegativeDurationError`, `ImplausibleEndTimeError`, `InvalidFocusRatingError`, `NotAPresetSessionError`,
`CannotEditRunningSessionError`, `InvalidDurationError`. Każdy niesie stabilny łańcuch `code` do mapowania HTTP.
**Żaden nie loguje-i-jedzie-dalej** - przerywają operację (fail-fast, zgodnie z ograniczeniem briefu).

### 4.2 Repozytorium: `SessionRepository` (NOWY port nad istniejącym szwem)

Projekt ma już port persystencji, `SessionPersistence`
[persistence.ts:19-23](../../src/lib/session/persistence.ts#L19), ale jest to port **w kształcie CRUD**
(`createSession` / `endSession`), więc każdy wywołujący wciąż podaje mu przed-zdecydowany zapis. Refaktor
**zawęża go do repozytorium w kształcie agregatu**: załaduj agregat, pozwól agregatowi zdecydować, zapisz agregat.

```
// src/lib/domain/sessionRepository.ts   (NOWE)
interface SessionRepository {
  load(id: string): Promise<FocusSession | null>;   // null => nie znaleziono / nie właściciel
  save(session: FocusSession): Promise<void>;        // persystuje cały snapshot
}
```

- **`SupabaseSessionRepository`** (**NOWE**, otacza dzisiejsze wywołania remote): `load` = istniejący
  ograniczony do właściciela SELECT ([\[id\].ts:91-97](../../src/pages/api/sessions/[id].ts#L91) uogólniony);
  `save` tłumaczy brudne przejście agregatu na **ten sam ręcznie wybrany zapis kolumn**, którego wymaga L-01
  [lessons.md:9](../foundation/lessons.md#L9) - `{ended_at, focus_rating, note}` dla zakończenia,
  `{timer_mode, planned_focus_seconds}` dla continue. RLS + `.eq("user_id")` pozostają dokładnie jak są.
- **`LocalSessionRepository`** (**NOWE**, otacza `localSessions.ts`): `load` czyta item po id; `save` zapisuje
  snapshot z powrotem. Ponieważ *agregat* już uruchomił preconditions `end()`, ciche nadpisanie z `endLocalSession`
  (G-4) jest zastąpione strzeżonym zapisem - **ścieżka anonimowa dziedziczy write-once za darmo**, zamykając
  największą dziurę bez zmiany UI.

**Atomowość (INV-5).** Obie implementacje `save` persystują zakończenie w **jednej** operacji: repo Supabase w
jednym `UPDATE ... WHERE id AND user_id AND ended_at IS NULL` (filtr DB pozostaje jako obrona-w-głąb mimo że
agregat już sprawdził), repo local w jednym `setItems`. Żaden częściowy stan zakończenia nie jest obserwowalny.
Filtr write-once DB zostaje jako szelki; agregat to pasek.

### 4.3 Cienkie route'y / wyspy (egzekucja przenosi się z klienta)

Route API kurczy się do **parse -> load -> wywołaj metodę -> save -> mapuj błąd**:

```
// PATCH /api/sessions/[id]   (PO)
const parsed = parseJson(req, endSessionSchema);          // tylko kształt
const session = await repo.load(id);                       // ograniczony do właściciela
if (!session) return 404;
try {
  session.end({ ...parsed.data, nowMs: Date.now() });     // WSZYSTKIE niezmienniki tutaj
  await repo.save(session);                                // pojedynczy zapis
  return 200;
} catch (e) {
  return mapDomainErrorToResponse(e);                      // SessionAlreadyEndedError -> 409, InvalidFocusRating -> 400, ...
}
```

Dla wyspy anonimowej ten sam `FocusSession.end()` działa po stronie klienta na `LocalSessionRepository`, więc
reguła to **identyczny kod na obu ścieżkach**. Strażnik UI `SessionRunner.submitRating`
[SessionRunner.tsx:137](../../src/components/session/SessionRunner.tsx#L137) zostaje jako afordancja UX, ale
**nie jest już jedynym strażnikiem** - podwójne wysłanie teraz rzuca `SessionAlreadyEndedError` z agregatu zamiast
po cichu nadpisywać.

---

## KROK 5 - Before/after, plan, testy

### 5.1 Before / after dla każdego miejsca

| Miejsce | Przed | Po |
| --- | --- | --- |
| G-1 PATCH | Route wstawia inline filtr write-once + prawdopodobieństwo + wybór kolumn. | Route woła `session.end(...)`; DB `.is("ended_at", null)` zachowane jako obrona-w-głąb. |
| G-2 continue | Route wstawia inline konwersję count_up. | Route woła `session.continueAsCountUp()`; ten sam strażnik DB zachowany. |
| G-3 PUT | Route wstawia inline "musi być zakończona" + przeliczenie czasu trwania. | Route woła `session.edit(...)`; to samo ograniczenie DB zachowane. |
| G-4 `endLocalSession` | **Niestrzeżone nadpisanie** dowolnego wiersza. | Zastąpione przez `LocalSessionRepository.save` po `session.end(...)` - **write-once + zakres oceny teraz egzekwowane dla anon**. |
| G-5 `submitRating` | `if (stoppedAtMs === null) return;` to jedyny strażnik anon. | Ta sama kontrola UI, ale agregat jest teraz autorytatywny; podwójne zakończenie rzuca zamiast nadpisywać. |
| G-6 `access.ts` | Wyprowadza status niezależnie. | Bez zmian (strona odczytu); opcjonalnie użyj `FocusSession.status`. |
| G-7 SELECT dashboard | Wyprowadza status niezależnie. | Bez zmian (strona odczytu). |

### 5.2 Fazowy plan refaktoru

Projekt ma dyscyplinę test-first (Vitest unit + `tests/integration/api` + pgTAP + Playwright,
[arch.md:586](../foundation/arch.md#L586)); fazy dodające regułę domenową idą **test-first**.

1. **Faza 1 - `FocusSession` + błędy (test-first).** Napisz testy jednostkowe dla każdego przejścia (KROK 5.3)
   przeciw jeszcze-nieistniejącemu agregatowi, potem implementuj `focusSession.ts` + `errors.ts` aż do zieleni.
   Bez podpięcia produkcyjnego. **Weryfikacja:** `npm run test` (unit) zielony; `astro check` (per L-08
   [lessons.md:84](../foundation/lessons.md#L84)) czysty.
2. **Faza 2 - `SessionRepository` + dwa adaptery.** Zaimplementuj `SupabaseSessionRepository` i
   `LocalSessionRepository`. **Weryfikacja:** istniejące `tests/integration/api` dla PATCH/PUT/continue wciąż
   zielone przy route delegującym; zestaw pgTAP RLS bez zmian.
3. **Faza 3 - Przepnij trzy route'y** (PATCH, PUT, continue) na parse -> load -> metoda -> save, dodaj
   `mapDomainErrorToResponse`. **Weryfikacja:** testy integracyjne asertują 409 na podwójne zakończenie, 400 na
   złą ocenę - ten sam kontrakt HTTP co dziś (bez zmiany klienta).
4. **Faza 4 - Przepnij wyspę anonimową** na kończenie przez `FocusSession` + `LocalSessionRepository`; usuń
   niestrzeżone nadpisanie `endLocalSession`. **Weryfikacja:** nowy test jednostkowy anon dla podwójnego
   zakończenia (KROK 5.3 T-11) zielony; fixture Playwright anon wciąż przechodzi pętlę przechwytywania.
5. **Faza 5 (opcjonalne utwardzenie, DB) - dodaj ograniczenie, na które niezmiennik zasługuje.** Trigger lub
   częściowa gwarancja, że `ended_at` nie może być przepisane po ustawieniu na serwerze-jako-źródle-prawdy, oraz
   CHECK `ended_at IS NULL OR ended_at >= started_at`. **Weryfikacja:** pgTAP asertuje, że drugi `UPDATE`
   `ended_at` jest odrzucony na warstwie DB (zamyka tryb awarii 4). Zachowaj nietkniętą politykę delete z L-06
   [lessons.md:62](../foundation/lessons.md#L62).

Fazy 1-4 zachowują zachowanie na ścieżce remote (ten sam kontrakt HTTP) i *naprawiają* zachowanie na ścieżce
anon (podwójne zakończenie teraz zawodzi szybko). Faza 5 to jedyna zmiana schematu i może wyjść niezależnie.

### 5.3 Przypadki testowe dla niezmiennika (legalne + nielegalne przejścia)

Jednostkowe (agregat) - zestaw nośny:

- **T-1 (legalne):** `end(valid)` na sesji w toku -> status `ended`, czas trwania = `ended - started`.
- **T-2 (nielegalne, INV-3):** `end()` na już zakończonej sesji -> rzuca `SessionAlreadyEndedError`.
- **T-3 (nielegalne, INV-4):** `end(endedAtMs < startedAtMs)` -> rzuca `NegativeDurationError`.
- **T-4 (nielegalne, INV-7):** `end(endedAtMs)` daleko w przeszłość/przyszłość -> rzuca `ImplausibleEndTimeError`.
- **T-5 (nielegalne, INV-6):** `end(focusRating = 0 | 6 | 2.5)` -> rzuca `InvalidFocusRatingError`; `null` (pominięcie) legalne.
- **T-6 (legalne, INV-10):** `continueAsCountUp()` na running preset -> tryb `count_up`, `plannedFocus` null, `plannedBreak` zachowany.
- **T-7 (nielegalne, INV-10):** `continueAsCountUp()` na zakończonej -> `SessionAlreadyEndedError`; na count_up -> `NotAPresetSessionError`.
- **T-8 (nielegalne, edit):** `edit()` na działającej sesji -> `CannotEditRunningSessionError`; `edit(duration<1)` -> `InvalidDurationError`.

Integracyjne (API, oba muszą utrzymać dzisiejszy kontrakt):

- **T-9:** podwójny `PATCH` -> drugi zwraca **409** (bez zmian względem G-1).
- **T-10:** `PATCH` z `focus_rating = 7` -> **400**.

Anonimowe (jednostkowe, nowo-zamknięta dziura):

- **T-11:** wywołanie zakończenia anon dwa razy na jednym lokalnym wierszu -> drugie rzuca
  `SessionAlreadyEndedError`, zapisany wiersz **nie** jest przepisany (dziś po cichu jest, G-4).

### 5.4 Nazwy nośne do zarejestrowania

Projekt używa [lessons.md](../foundation/lessons.md) jako swojego rejestru kontraktów tylko-do-dopisywania. Po
wdrożeniu tego refaktoru dodaj wpis (proponowany **L-09**) przypinający:

- `FocusSession` jest **jedynym** właścicielem przejścia kończącego sesję; route'y i wyspy muszą iść
  **load -> metoda -> save**, nigdy nie reimplementując inline kontroli write-once/prawdopodobieństwa/oceny.
- `SessionRepository` (`load` / `save`) zastępuje doraźne zapisy `endSession`; oba adaptery, Supabase i Local,
  muszą kierować zakończenia przez `FocusSession.end()`.
- Filtr DB `.is("ended_at", null)` oraz (Faza 5) CHECK/trigger to **obrona-w-głąb**, nie główny strażnik - nie
  usuwaj ich, ale i nie polegaj na nich jako jedynym strażniku (zagrożenie L-01).
- Nazwane błędy (`SessionAlreadyEndedError`, ...) mapują na HTTP w jednym miejscu (`mapDomainErrorToResponse`);
  dodanie przejścia oznacza dodanie błędu + mapowania, nie nowego inline `if` w route.

---

## Podsumowanie

Reguły domenowe PomoSapiens muszą zachodzić na dwóch backendach persystencji - zalogowanej ścieżce Postgres i
anonimowej ścieżce localStorage - a jedynym niezmiennikiem, który jest jednocześnie najbardziej rdzeniowy dla
produktu i najsłabiej egzekwowany, jest **przejście kończące sesję**: sesja musi zakończyć się dokładnie raz,
atomowo z oceną i notatką, dając nieujemny rzeczywisty czas trwania i ocenę 1..5-lub-pominięcie. Na ścieżce
zalogowanej reguła przetrwa jedynie jako rozproszona dyscyplina (filtr PATCH `.is("ended_at", null)`, okno
prawdopodobieństwa, generowana kolumna i granice zod - dokładnie ta dyscyplina, dla której zapamiętania istnieje
lekcja L-01), podczas gdy na ścieżce anonimowej jest egzekwowana przez **nic poza UI React**: `endLocalSession`
nadpisuje dowolny wiersz, zakończony czy nie, bez kontroli write-once, prawdopodobieństwa ani oceny, więc klient
jest jedynym strażnikiem, a podwójne zakończenie po cichu psuje punkt danych zamiast zawieść szybko. Wcześniejsza
distylacja oznaczyła te niezmienniki jako "ENFORCED", bo audytowała tylko ścieżkę serwerową; poszerzenie na oba
backendy ujawnia lukę. Naprawa to refaktor, nie przepisanie: wprowadzić czysty agregat `FocusSession`, którego
metody `end()` / `continueAsCountUp()` / `edit()` niosą preconditions i rzucają nazwane błędy domenowe, oraz port
`SessionRepository` (adaptery Supabase + Local), tak by oba backendy ładowały, wykonywały przejście i zapisywały
przez tego samego strażnika - kurcząc każdy route do parse -> load -> metoda -> save -> mapuj błąd i przenosząc
egzekucję z klienta. Plan jest fazowy test-first (agregat, repozytorium, przepięcie route'ów, przepięcie
anonimowe, opcjonalne ograniczenie DB), zachowuje istniejący kontrakt HTTP i obronę-w-głąb RLS nietkniętą i
rejestruje nowe nazwy nośne (`FocusSession`, `SessionRepository`, błędy domenowe) w rejestrze lessons projektu
jako proponowany L-09.
