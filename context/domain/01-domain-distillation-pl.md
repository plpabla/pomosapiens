---
title: PomoSapiens - Destylacja Domeny
created: 2026-07-28
type: domain-distillation
---

# PomoSapiens - Destylacja Domeny

> Mapa domeny biznesowej wydestylowana z dokumentów źródłowych i zweryfikowana względem kodu.
> To jest **mapa, nie kod**. Każde stwierdzenie ma cytat `file:line`. Tam, gdzie pojęcie nie ma odpowiednika
> w kodzie, jest to oznaczone jako **NOT IN CODE**.

## Krok 0 - Odkryty kontekst projektu

**Przeczytane źródła (wymagania / wizja):**

- [idea-notes.md](../../idea-notes.md) - pierwotny brief MVP (po polsku). Określa cel biznesowy: "osobisty audytor efektywności", który przechodzi od zwykłego stopera Pomodoro do zrozumienia indywidualnych wzorców produktywności ([idea-notes.md:5](../../idea-notes.md#L5)).
- [context/foundation/prd.md](../foundation/prd.md) - zablokowany PRD (greenfield, 10 sekcji, FR-001..FR-018).
- [context/foundation/arch.md](../foundation/arch.md) - aktualny snapshot architektury (2026-07-16).
- [context/foundation/tech-stack.md](../foundation/tech-stack.md), [README.md](../../README.md) - stack i operacje.
- `context/archive/` - ponad 30 zamkniętych folderów zmian (historia wdrożonych funkcji, S-01..S-14).

**Stack i gdzie żyje logika biznesowa** (z [arch.md:10-11](../foundation/arch.md#L10) i zweryfikowane):

- Astro 6 SSR + wyspy React 19, Tailwind 4, shadcn/ui, wdrożone na Cloudflare Workers.
- Persystencja + tożsamość: Supabase (Postgres + RLS + Auth, cookie SSR sessions).
- Logika domenowa jest rozproszona po czterech warstwach:
  - **Persystencja / niezmienniki**: `supabase/migrations/*.sql` (schemat, CHECK, RLS).
  - **Granica żądania**: `src/pages/api/**` (handlery) + `src/lib/schemas/*.ts` (zod).
  - **Logika domenowa po stronie klienta**: `src/lib/timer/`, `src/lib/session/`, `src/lib/local/`, `src/lib/timeline/`.
  - **Słownik widoku**: `src/lib/types.ts` + generowany `src/db/database.types.ts`.

**Ograniczenie / uwaga:** dokumenty wymagań są bogate i aktualne, więc ta destylacja mocno się na nich opiera.
Najważniejsze odkrycie (Krok 4) mówi, że **główna reguła biznesowa nie ma niemal żadnego odpowiednika w kodzie** -
to odkrycie jest możliwe *właśnie dlatego*, że dokumenty są szczegółowe.

---

## Krok 1 - Ubiquitous Language (język wszechobecny)

Każde pojęcie: definicja, cytat źródłowy (`file:line`) oraz miejsce w kodzie (lub **NOT IN CODE**).

| Pojęcie | Definicja | Źródło (dokument) | Miejsce w kodzie |
| --- | --- | --- | --- |
| **Session** (sesja) | Jeden odmierzany blok skupienia wraz z kontekstem zebranym wokół niego; atomowa jednostka produktu. | "PomoSapiens treats every focus session as a data point" [prd.md:139](../foundation/prd.md#L139) | tabela `sessions` [20260531182506_sessions_data_foundation.sql:80](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L80); typ `SessionListItem` [types.ts:27](../../src/lib/types.ts#L27) |
| **Energy level** (poziom energii) | Samoocena przed sesją low/medium/high; *jedyne wymagane* pole przedsesyjne. | FR-009 "must record a one-tap pre-session energy level (low / medium / high)" [prd.md:92](../foundation/prd.md#L92) | enum `energy_level` [migration:10](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L10); `NOT NULL` [migration:91](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L91); schemat [session.ts:4](../../src/lib/schemas/session.ts#L4) |
| **Material format** (format materiału) | Forma nauki (video / reading / writing code / drilling problems / other); opcjonalny per sesja. | FR-008 [prd.md:90](../foundation/prd.md#L90) | tabela `material_formats` + 5 zaseedowanych domyślnych [migration:115](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L115) |
| **Topic** (temat) | Kategoria nauki zarządzana przez użytkownika; opcjonalna per sesja, wybierana z własnej listy. | FR-007 [prd.md:88](../foundation/prd.md#L88); FR-017 add/rename/archive [prd.md:120](../foundation/prd.md#L120) | tabela `topics` [migration:56](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L56) |
| **Focus rating** (ocena skupienia) | Samoocena jakości po sesji 1-5 lub **skip**. | FR-013 "rate focus quality on a 1-5 scale, with an explicit 'skip'" [prd.md:106](../foundation/prd.md#L106) | `focus_rating smallint ... CHECK BETWEEN 1 AND 5`, NULL = pominięte [migration:92](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L92); schemat [session.ts:25](../../src/lib/schemas/session.ts#L25) |
| **Note** (notatka) | Opcjonalny tekst o tym, co udało się zrealizować, max 500 znaków. | FR-014 (nice-to-have) [prd.md:108](../foundation/prd.md#L108) | `note text NULL` [migration:99](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L99); limit 500 znaków [session.ts:35](../../src/lib/schemas/session.ts#L35) |
| **Timer mode** (tryb stopera) | Który timer działa: `preset_1/2/3` lub `count_up`; opcjonalny, domyślnie ostatnio użyty. | FR-010 [prd.md:94](../foundation/prd.md#L94) | typ `Mode` [types.ts:4](../../src/lib/types.ts#L4); DB CHECK [migration:95](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L95) |
| **Count-up (open-ended)** (zliczanie w górę) | Alternatywa dla odliczających presetów; brak zaplanowanych czasów, kończy się tylko przez Stop. | FR-005 [prd.md:79](../foundation/prd.md#L79) | gałęzie `mode === "count_up"` [useFocusTimer.ts:88](../../src/lib/timer/useFocusTimer.ts#L88) |
| **Planned focus/break seconds** (zaplanowane sekundy) | *Migawka* czasów wybranego presetu skopiowana na wiersz sesji przy starcie. | "planned_*_seconds are snapshots, not references" [arch.md:302](../foundation/arch.md#L302) | kolumny [20260630000000...:61-67](../../supabase/migrations/20260630000000_user_presets_and_session_audit_cols.sql#L61); migawka w [useSessionStart.ts:47](../../src/lib/session/useSessionStart.ts#L47) |
| **Duration (elapsed)** (czas trwania) | Rzeczywisty czas skupienia wg zegara; zapisywany nawet przy wcześniejszym zatrzymaniu. | FR-012 "partial elapsed time is recorded as the session's actual duration" [prd.md:101](../foundation/prd.md#L101) | kolumna GENERATED `duration_seconds` [migration:85](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L85) |
| **In-progress vs done** (w toku / zakończona) | Status cyklu życia, *wyprowadzany* z `ended_at` (NULL = w toku). | "A session's lifecycle is written in ended_at ... Status is derived, never stored" [arch.md:304](../foundation/arch.md#L304) | [access.ts:14](../../src/lib/session/access.ts#L14) |
| **Continue / "I'm still working"** (kontynuuj) | Konwersja w locie działającej sesji preset na count-up w momencie końca focus. | S-10 [arch.md:481](../foundation/arch.md#L481) | [continue.ts:23](../../src/pages/api/sessions/[id]/continue.ts#L23); `continueAsCountUp()` [useFocusTimer.ts:137](../../src/lib/timer/useFocusTimer.ts#L137) |
| **Abandon** (porzucenie) | Jawne usunięcie sesji ("zadzwonił telefon i nic nie zrobiłem"). | idea-notes "zadzwonił telefon i w sumie nic nie zrobiłem" [idea-notes.md:33](../../idea-notes.md#L33) | twardy `DELETE` [\[id\].ts:135](../../src/pages/api/sessions/[id].ts#L135) - brak przechowywanego stanu "abandoned" |
| **Pattern / insight (contextual effectiveness)** (wzorzec / wniosek) | Korelacja między kontekstem przedsesyjnym a samooceną skupienia - powód istnienia produktu. | "reveals to the student which combinations of pre-session context ... correlate with their own self-rated focus quality" [prd.md:139](../foundation/prd.md#L139) | **CZĘŚCIOWO** - tylko pojedynczy wykres focus-rating w czasie `FocusRatingChart` + read-only timeline. Brak modelu korelacji/cross-tab. Zob. Krok 4. |
| **Weekly synthesized insight (AI)** (tygodniowy wniosek AI) | LLM zamienia 7 dni danych w konkretne wskazówki. | idea-notes [idea-notes.md:41-45](../../idea-notes.md#L41); Open Question 2 [prd.md:179](../foundation/prd.md#L179) | **NOT IN CODE** (przesunięte do v2) |
| **User / Admin** | Dwie role; User widzi tylko swoje dane, Admin to rola operacyjna. | Access Control [prd.md:151-156](../foundation/prd.md#L151) | User = RLS `auth.uid()` wszędzie; **Admin NOT IN CODE** |
| **Anonymous visitor** (odwiedzający anonimowy) | Niezalogowany użytkownik uruchamiający pełną pętlę na localStorage. | S-08 [arch.md:16](../foundation/arch.md#L16) | `localSessions` itd. [localSessions.ts](../../src/lib/local/localSessions.ts) - **sprzeczne z non-goal w PRD**, zob. Krok 4 |
| **Timeline** (oś czasu) | Read-only siatka swimlane Day/Week/Month sesji. | S-14 [arch.md:524](../foundation/arch.md#L524) | `src/lib/timeline/`, strona `/timeline` |

---

## Krok 2 - Klasyfikacja subdomen (Core / Supporting / Generic)

Rdzeń = to, co stanowi przewagę konkurencyjną produktu i jego sens. Uzasadnienie odwołuje się do wizji
i kryteriów sukcesu.

| Obszar | Kategoria | Uzasadnienie (powiązane z celami produktu) |
| --- | --- | --- |
| **Contextual effectiveness analytics** (analityka efektywności kontekstowej: korelacja energii / pory dnia / formatu / tematu ze skupieniem) | **CORE** | To *jest* insight produktu: "learning effectiveness is contextual, not durational" [prd.md:24](../foundation/prd.md#L24). Sekcja Business Logic [prd.md:139](../foundation/prd.md#L139) czyni korelację jedyną nośną regułą. Wszystkie inne funkcje istnieją, by ją zasilić. |
| **Contextual session capture** (kontekstowe zbieranie sesji: wymagana energia, ustrukturyzowany opcjonalny kontekst, niskotarciowy start) | **CORE** | Maszyneria zbierania "is shaped specifically to feed this rule with clean inputs while keeping the start-of-session friction at three taps" [prd.md:143](../foundation/prd.md#L143). Guardrail <=3 tapnięć [prd.md:42](../foundation/prd.md#L42) to rdzeniowy wyróżnik, nie hydraulika. |
| **Pomodoro timer engine** (silnik stopera: presety, count-up, auto-przejście do przerwy, odporność wg zegara) | **SUPPORTING** | Konieczny i nietrywialny (NFR dokładności timera [prd.md:134](../foundation/prd.md#L134)), ale służy zbieraniu heterogenicznych kształtów sesji, nie jest wyróżnikiem. Student mógłby czerpać wartość z ręcznego wpisu; timer służy danym. |
| **Zarządzanie katalogiem topics / material-formats** | **SUPPORTING** | Wymagane, by analiza per-temat miała czyste klucze (FR-017 istnieje *dlatego*, że FR-007 wybrało "select from list" [prd.md:121](../foundation/prd.md#L121)). Ustrukturyzowany lookup w służbie rdzenia, sam w sobie nie wyróżniający. |
| **Historia i edycja sesji** (lista, wykres, edit/delete/abandon) | **SUPPORTING** | Warstwa surowego dowodu, na której stoi rdzeń (FR-015 "the raw evidence layer the chart ... sits on top of" [prd.md:114](../foundation/prd.md#L114)). |
| **Weekly AI insights** | **CORE (aspiracyjne / odroczone)** | Ostateczne zwieńczenie reguły rdzeniowej ("Actionable Insights" [idea-notes.md:45](../../idea-notes.md#L45)), jawnie wyłączone z v1 [prd.md:179](../foundation/prd.md#L179). |
| **Uwierzytelnianie i tożsamość** | **GENERIC** | Federated + email/password (FR-001..003); rozwiązane przez Supabase Auth. Brak logiki specyficznej dla produktu. |
| **Kontrola dostępu / izolacja użytkowników (RLS)** | **GENERIC (ale twardy guardrail)** | Standardowa izolacja per-owner; oddana Postgres RLS. Mechanizm generyczny, ale NFR prywatności [prd.md:131](../foundation/prd.md#L131) czyni jego poprawne zastosowanie nienegocjowalnym. |
| **Warstwa persystencji (port Postgres / localStorage)** | **GENERIC** | Port `SessionPersistence` [arch.md:330](../foundation/arch.md#L330) to infrastruktura; anonimowe lustro to wybór dostarczenia, nie domena. |

---

## Krok 3 - Kandydaci na agregaty i ich niezmienniki

Dla każdego kandydata: reguła biznesowa, która musi zawsze być prawdziwa, jej źródło oraz czy kod ją
**egzekwuje (ENFORCED)**, **deklaruje (DECLARED)**, czy **ignoruje (IGNORED)**.

### Kandydat A - `Session` (korzeń agregatu; najsilniejszy kandydat)

| Niezmiennik | Źródło | Status egzekwowania |
| --- | --- | --- |
| Poziom energii jest zawsze obecny. | FR-009 [prd.md:92](../foundation/prd.md#L92) | **ENFORCED** (DB `NOT NULL` [migration:91](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L91) + zod required [session.ts:4](../../src/lib/schemas/session.ts#L4) + guard klienta `if (!energy) return` [useSessionStart.ts:21](../../src/lib/session/useSessionStart.ts#L21)). |
| Sesja jest kończona dokładnie raz; zakończonej nie można zakończyć ponownie. | "Write-once end" [arch.md:480](../foundation/arch.md#L480) | **ENFORCED** (guard `.is("ended_at", null)` na PATCH -> 409 [\[id\].ts:54](../../src/pages/api/sessions/[id].ts#L54)). |
| Zapisany czas = rzeczywisty czas wg zegara (`ended_at - started_at`), włącznie z wcześniejszym stopem. | FR-012 [prd.md:101](../foundation/prd.md#L101) | **ENFORCED** (kolumna GENERATED [migration:85](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L85); brak arytmetyki w aplikacji). |
| Focus rating to 1-5 lub NULL (skip); nigdy 0 ani 6. | FR-013 [prd.md:106](../foundation/prd.md#L106) | **ENFORCED** (DB CHECK [migration:92](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L92) + zod [session.ts:26](../../src/lib/schemas/session.ts#L26)). |
| Tryb `count_up` => oba zaplanowane czasy NULL; preset => oba non-NULL. | "count_up => null planned invariant is app-maintained, not DB-enforced" [arch.md:302](../foundation/arch.md#L302) | **DECLARED, częściowo ENFORCED, celowo rozluźniony.** POST odrzuca naruszenia [sessions/index.ts:24-30](../../src/pages/api/sessions/index.ts#L24). Ale brak DB CHECK, a `continue.ts` zeruje tylko `planned_focus_seconds`, **zachowując `planned_break_seconds`** [continue.ts:23](../../src/pages/api/sessions/[id]/continue.ts#L23) - więc skonwertowany wiersz count-up może z założenia nosić non-null planned break ([arch.md:302](../foundation/arch.md#L302)). |
| `ended_at` musi być wiarygodne (w `[now-2h, now+5s]`) - guard przeciw manipulacji zegarem. | "plausibility window" [arch.md:480](../foundation/arch.md#L480) | **ENFORCED** tylko na PATCH [\[id\].ts:45](../../src/pages/api/sessions/[id].ts#L45); celowo *nieobecny* na PUT edit [\[id\].ts:1-5](../../src/pages/api/sessions/[id].ts#L1). |
| Każdy zapis dotyka tylko ręcznie wybranego zestawu kolumn (nigdy `.update(parsed.data)`) - lekcja L-01. | [arch.md:479](../foundation/arch.md#L479) | **ENFORCED** (jawne obiekty kolumn w każdym miejscu zapisu). |
| Sesja należy do dokładnie jednego użytkownika; nigdy widoczna dla innego. | NFR prywatności [prd.md:131](../foundation/prd.md#L131) | **ENFORCED** (polityki RLS per-operacja [migration:134-149](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L134) + `.eq("user_id", ...)` obrona w głąb; pgTAP `rls_sessions.sql`). |

### Kandydat B - `UserPresets` (zestaw 3 slotów jako jeden agregat)

| Niezmiennik | Źródło | Status egzekwowania |
| --- | --- | --- |
| Dokładnie trzy sloty (1,2,3) na użytkownika, logicznie zawsze obecne. | FR-004 [prd.md:77](../foundation/prd.md#L77); "three slots always exist logically" [arch.md:311](../foundation/arch.md#L311) | **DECLARED** - sloty nie są seedowane; domyślne wartości scalane w kodzie aplikacji (`preset-defaults.ts`), brak polityki DELETE, więc utrwalony slot nie może zniknąć [arch.md:311](../foundation/arch.md#L311). Wartości slotu ograniczone przez DB `CHECK (slot IN (1,2,3))` + `UNIQUE(user_id, slot)` [20260630...:12-17](../../supabase/migrations/20260630000000_user_presets_and_session_audit_cols.sql#L12). |
| Focus 60..14400s; break 0..3600s. | FR-004 domyślne [prd.md:77](../foundation/prd.md#L77) | **ENFORCED** (DB CHECK [20260630...:13-14](../../supabase/migrations/20260630000000_user_presets_and_session_audit_cols.sql#L13) + lustrzane granice w zod [session.ts:10-21](../../src/lib/schemas/session.ts#L10)). |

### Kandydat C - `Topic` / `MaterialFormat` (encje katalogowe)

| Niezmiennik | Źródło | Status egzekwowania |
| --- | --- | --- |
| Nazwa unikalna per owner (włącznie z zaseedowanymi domyślnymi jako różne). | FR-017 [prd.md:120](../foundation/prd.md#L120) | **ENFORCED** (`UNIQUE(owner_id, name)` + częściowy indeks unikalny dla NULL-owner [migration:36-43](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L36)). |
| Archiwizacja jest miękka (nigdy twarde usunięcie); zarchiwizowane wypadają z pickera. | FR-017 "archive" [prd.md:120](../foundation/prd.md#L120) | **ENFORCED** (kolumna `archived_at` + częściowy indeks aktywnych [20260627140018...:5-17](../../supabase/migrations/20260627140018_add_archived_at_to_topics_and_formats.sql#L5)). |
| Usunięcie topicu/formatu nie może zniszczyć historycznych sesji. | Implikowane przez NFR historii | **ENFORCED** (`ON DELETE SET NULL` na obu FK [migration:93-94](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L93)). |

### Kandydat D - `EffectivenessProfile` / `PatternView` (rdzeniowy read-model)

| Niezmiennik | Źródło | Status egzekwowania |
| --- | --- | --- |
| System ujawnia, jak samoocena skupienia zmienia się w zależności od kontekstu przedsesyjnego (energia x pora dnia x format x temat). | Business Logic [prd.md:139-141](../foundation/prd.md#L139) | **IGNORED / ABSENT.** Żaden agregat, serwis ani zapytanie nie liczy korelacji międzykontekstowej. Istnieją tylko `FocusRatingChart` (ocena w czasie) i read-only timeline. To rdzeń domeny **bez odpowiednika w kodzie** - zob. Krok 4 i 5. |

---

## Krok 4 - Rozjazdy MODEL vs KOD (najcenniejsza sekcja)

| # | Dokument mówi X | Kod robi Y | Dowód |
| --- | --- | --- | --- |
| **D-1** | *Rdzeniowa reguła* produktu to korelacja kontekstowa: "which combinations of ... energy, time of day, material format, topic - correlate with their own self-rated focus quality" [prd.md:139](../foundation/prd.md#L139). | Kod dostarcza tylko pojedynczy wykres **focus-rating w czasie** oraz surową siatkę **timeline**. Nie ma nigdzie korelacji, cross-tab ani agregacji per-kontekst. Rdzeniowa subdomena jest w praktyce niezbudowana. | `FocusRatingChart` (Recharts, ocena vs czas) [arch.md:629](../foundation/arch.md#L629); timeline jest jawnie read-only historią [arch.md:524](../foundation/arch.md#L524). Brak modułu analityki w `src/lib/`. |
| **D-2** | Non-Goal w PRD: "**No non logged-in user scenario with utilization of localStorage** - Add as follow up" [prd.md:162](../foundation/prd.md#L162). | Anonimowa pętla zbierania na localStorage jest **w pełni wdrożona** (S-08): stores, port, `AnonSessionApp` na `/`. | [arch.md:16](../foundation/arch.md#L16); [localSessions.ts](../../src/lib/local/localSessions.ts). Non-goal w PRD jest teraz nieaktualny/sprzeczny. |
| **D-3** | Access Control definiuje rolę **Admin**: "view system-level diagnostics, inspect user records ... run maintenance tasks" [prd.md:154](../foundation/prd.md#L154). | Nie istnieje żadna rola admin, flaga, polityka ani UI. Każda decyzja dostępu to `user_id = auth.uid()`. | Polityki RLS są tylko dla `authenticated`, ograniczone do właściciela [migration:134-149](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L134). Brak kolumny `is_admin` ani route admina. |
| **D-4** | Sesje `count_up` mają **null zaplanowane czasy** (niezmiennik) [arch.md:302](../foundation/arch.md#L302). | Po konwersji w locie ("continue") wiersz jest `count_up`, ale **zachowuje `planned_break_seconds`** - niezmiennik jest celowo rozluźniony do momentu insertu. | POST wymusza oba-null [sessions/index.ts:24](../../src/pages/api/sessions/index.ts#L24); continue zeruje tylko focus [continue.ts:23](../../src/pages/api/sessions/[id]/continue.ts#L23). Żaden nie jest egzekwowany przez DB (brak CHECK). |
| **D-5** | Dziedzina `timer_mode` to dokładnie `{preset_1,preset_2,preset_3,count_up}` (FR-010) [prd.md:94](../foundation/prd.md#L94). | Kolumna DB **dopuszcza także `NULL`** (`timer_mode IS NULL OR ...`) [migration:95](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L95), starsze "anticipating-but-nullable" [migration:3](../../supabase/migrations/20260531182506_sessions_data_foundation.sql#L3). Kod nigdy nie zapisuje NULL, więc DB dopuszcza stan, którego domena zabrania. | zod wymaga enuma [session.ts:9](../../src/lib/schemas/session.ts#L9); DB nie. |
| **D-6** | "Abandon" to prawdziwa akcja domenowa ("zadzwonił telefon i nic nie zrobiłem" [idea-notes.md:33](../../idea-notes.md#L33); kontekst FR). | **Nie ma przechowywanego stanu "abandoned"** - abandon to twardy `DELETE`, a status to dwuwartościowa dedukcja z `ended_at`. | Handler `DELETE` [\[id\].ts:135](../../src/pages/api/sessions/[id].ts#L135); status wyprowadzany [access.ts:14](../../src/lib/session/access.ts#L14). Sygnał, który FR-012 nazwał "informative" [prd.md:102](../foundation/prd.md#L102), jest odrzucany, a nie zbierany. |
| **D-7** | Kolor per-kategoria nie występuje w narracji domenowej. | Timeline utrwala kolory per-kategoria, prawdziwą preferencję bliską domenie, **tylko w localStorage** nawet dla zalogowanych [arch.md:305](../foundation/arch.md#L305). | Obronne (prezentacja, nie trwała domena), ale to drugi wyjątek od "server owns truth" warty odnotowania. |

---

## Krok 5 - Ranking refaktoru (wartość x ryzyko)

Wartość = jak rdzeniowy jest niezmiennik dla produktu. Ryzyko = jak słabo jest dziś egzekwowany.

| Ranga | Cel | Wartość | Ryzyko (luka w egzekwowaniu) | Werdykt |
| --- | --- | --- | --- | --- |
| **#1** | **Daj rdzeniowej domenie dom: read-model `Effectiveness`/`PatternView`** (D-1) | **Najwyższa** - to cała teza produktu [prd.md:139](../foundation/prd.md#L139). | **Całkowite** - żaden kod tego nie modeluje; aplikacja to obecnie narzędzie do zbierania + surowy log, a nie "effectiveness auditor" obiecany w wizji. | **Budowa, nie refaktor.** Najważniejsza luka. Wszystko już zbierane (energia, pora dnia, format, temat, ocena, czas) to czyste dane wejściowe czekające na ten model. Zacznij od agregacji per-kontekst (np. mediana oceny wg energia x format) za zapytaniem/serwisem, potem to pokaż. |
| #2 | **Przenieś niezmiennik `count_up => null planned` do DB** (D-4/D-5) | Średnia - chroni integralność danych wejściowych rdzenia. | Wysokie - tylko w aplikacji, już niespójne między POST a continue, a DB dopuszcza NULL `timer_mode`. | Refaktor: dodaj DB CHECK wyrażający realną (rozluźnioną) regułę i zawęź `timer_mode` do `NOT NULL`. Niski koszt, zamyka cichą drogę rozspójności. |
| #3 | **Zbieraj abandon jako sygnał zamiast go usuwać** (D-6) | Średnia - FR-012 nazywa porzucone sesje "themselves signal" [prd.md:102](../foundation/prd.md#L102). | Średnie - dane są wyrzucane przy DELETE. | Najpierw decyzja produktowa, potem miękki stan abandon. Nie pilne dla v1, ale istotne gdy powstanie #1 (wzorce porzuceń są częścią insightu). |
| #4 | **Uzgodnij nieaktualne stwierdzenia PRD** (D-2 anonimowy non-goal, D-3 admin) | Niska (higiena dokumentu) | Niskie | Zaktualizuj PRD: wyprowadź ścieżkę anonimową z Non-Goals oraz albo zaimplementuj, albo jawnie odrocz Admina. |

**#1 do refaktoru/budowy i dlaczego:** agregat `Session` jest już dobrze zabezpieczony, więc *ryzyko* domeny
nie leży w zbieraniu - leży w tym, że **rdzeniowa subdomena (contextual effectiveness analytics) nie ma żadnego
agregatu, serwisu ani zapytania w kodzie.** Produkt obecnie zapisuje świetne dane kontekstowe, a potem rysuje
jedynie linię oceny w czasie. Zamknięcie tej luki to miejsce, gdzie model domeny i kod rozjeżdżają się najbardziej
i gdzie faktycznie żyje deklarowana wartość produktu.

---

## Podsumowanie

Ten artefakt destyluje domenę PomoSapiens z jej PRD, pierwotnych idea-notes i snapshotu architektury, a następnie
weryfikuje każde pojęcie względem działającego kodu z cytatami `file:line`. Buduje tabelę Ubiquitous Language
(Session, energy level, material format, topic, focus rating, timer mode/preset, migawki zaplanowanych czasów,
wyprowadzany czas trwania, continue, abandon, pattern-insight), klasyfikuje subdomeny (Core: kontekstowe zbieranie
+ analityka efektywności; Supporting: silnik timera, katalogi, historia; Generic: auth, RLS, persystencja) i wskazuje
`Session` jako dominujący agregat z zestawem w dużej mierze dobrze egzekwowanych niezmienników (zawsze obecna energia,
zapisz-raz zakończenie, generowany czas trwania, ocena 1-5-lub-skip, izolacja per-użytkownik). Najcenniejszy wynik to
tabela rozjazdów MODEL vs KOD: **rdzeniowa reguła biznesowa - ujawnianie, które kombinacje kontekstowe korelują z
samooceną skupienia - nie ma w zasadzie odpowiednika w kodzie**, wdrożona ścieżka anonimowa na localStorage jest
sprzeczna z non-goal PRD, rola Admin jest niezdefiniowana w kodzie, a niezmiennik `count_up => null planned` istnieje
tylko w aplikacji i jest już rozluźniony. Wniosek nagłówkowy: zbieranie danych jest solidne, ale wyróżniająca
rdzeniowa subdomena produktu (contextual effectiveness analytics) jest niezamodelowana - to miejsce #1 do inwestycji
i jest to budowa, a nie poprawka.
