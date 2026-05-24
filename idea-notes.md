# PomoSapiens - MVP ideas

# Cel Biznesowy Aplikacji

Stworzenie inteligentnego narzędzia do analityki i optymalizacji procesu nauki (tzw. "osobisty audytor efektywności"). Aplikacja przechodzi od klasycznego odliczania czasu (Pomodoro) do głębokiego zrozumienia indywidualnych wzorców produktywności użytkownika. Główną wartością biznesową jest oszczędność czasu użytkownika poprzez wskazanie mu, kiedy, jak i z jakich materiałów uczy się najefektywniej, aby uniknąć frustracji i "walenia głową w mur".

## Adresat

Adresatem nie jest „każdy, kto chce być produktywny”. Celujemy w świadomych self-learnerów (studentów, programistów, ludzi uczących się przebranżowić), którzy już próbują optymalizować swój czas, ale brakuje im wyciągania wniosków. Pierwszą akcję robi człowiek, który siada do nauki i chce wiedzieć, co mu realnie przynosi efekty.

# Zidentyfikowane Funkcje (Features)

## Moduł Śledzenia Czasu i Kontekstu (Stoper Pomodoro +)

Wybór tematu/kategorii: Przed uruchomieniem sesji użytkownik określa, czego się uczy.

Określenie formatu materiału: Definiowanie formy nauki (np. kurs online, czytanie książki, pisanie kodu, oglądanie wideo).

Szybki check-in energii (1-click): Tuż przed startem użytkownik wybiera swój aktualny poziom zmęczenia/energii za pomocą jednego przycisku.

## Moduł Feedbacku po Sesji

Ocena jakości skupienia: Krótka ocena sesji po jej zakończeniu (np. skala 1-5).

Notatka z postępu: Opcjonalne pole na wpisanie, co konkretnie udało się zrealizować podczas danej sesji.

## Analityka i Wizualizacja (Dashboarding)

Panel użytkownika: Miejsce, gdzie można samodzielnie przeglądać zgromadzone dane i wykresy, m.in. oś czasu oraz wykres pokazujący ile czasu spędziłem każdego dnia (na różnych aktywnościach itp.)

Śledzenie trendów: Wizualizacja zależności między porą dnia, poziomem energii na starcie, a ostateczną efektywnością nauki.

Możliwość edycji wprowadzonych danych - w szczególności manualne dodanie sekcji, edycja (bo "zapomniałem wyłączyć"), czy usunięcie ("zadzwonił telefon i w sumie nic nie zrobiłem")

## Grywalizacja i Budowanie Nawyku

Streaks (Serie dni): Śledzenie ciągłości nauki dzień po dniu w celu utrzymania motywacji.

Śledzenie osiągnięć: Statystyki pokazujące m.in. kiedy w ciągu tygodnia użytkownik uczył się najwięcej.

## Inteligentne Raporty Tygodniowe (Wsparcie LLM)

Analiza AI raz w tygodniu: Model językowy przetwarza dane z ostatnich 7 dni i zamienia suche liczby w konkretne wnioski.

Konkretne wskazówki (Actionable Insights): Raport zawiera jasne rekomendacje na kolejny tydzień (np. "W czwartki wieczorem Twoja produktywność spada o 40% – wtedy planuj lżejsze tematy, a trudne kursy wideo przenieś na wtorek rano").

## Integracja ze Spotify

Osadzenie playera, żeby użytkownik nie musiał się przełączać między oknami

## Generacja wybranego tła

Na podstawie przesłanego promptu oraz (opcjonalnie) grafiki, generowane jest animowane tło sesji

# Pierwszy przepływ

Przepływ: Uwierzytelnienie użytkownika -> Zapisanie sesji (Start -> Wybór energii/formatu -> Stop -> Ocena skupienia) i zapisanie tego w bazie.
