# Bottlenecki uruchamiania testów — 25.10.2026

## Wynik

Wprowadzono dwie zmiany: ograniczenie powtarzanego wyboru narzędzia w najdroższym zestawie oraz wykorzystanie dostępnej historii kolejności po zmianie liczby workerów.

| Workery | Przed | Po | Oszczędność | Skrócenie |
|---:|---:|---:|---:|---:|
| 1 | 193,6 s | 161,3 s | 32,2 s | 16,6% |
| 4 | 64,9 s | 55,0 s | 9,9 s | 15,3% |

Wyniki pochodzą z pojedynczych pełnych przebiegów. Przed i po są różne wersje testów; zakres porównano po nazwie pliku, nazwie przypadku, typie i wyniku. Wszystkie 284 wcześniejsze przypadki pozostają. Doszedł jeden test jednostkowy schedulera: łącznie 65 jednostkowych i 220 E2E. Nowe przebiegi 1/4 mają identyczny skrót kodu i dokładnie te same identyfikatory, typy oraz wyniki wszystkich 285 przypadków.

## 1. Największy potwierdzony koszt: ponowny wybór tego samego trybu

`cad-02-point-measurements.test.cjs` sprawdza 1149 par punktów w 108 przypadkach oraz 9 wariantów wymiarowania łuków. W każdej iteracji pętli otwierał menu pomiaru i ponownie wybierał aktualny tryb. Każdy wybór oznaczał dwa kliknięcia Playwright i dodatkowe sprawdzenie DOM.

Profilowanie pierwszej z czterech partycji, bez zmiany geometrii ani danych:

| Operacja | Przed | Po |
|---|---:|---:|
| Wybór trybu | 291 wywołań; 8,87 s | 30 wywołań; 0,93 s |
| Kliknięcia punktów | 579; 3,89 s | 579; 3,74 s |
| Rysowanie figur | 60; 3,22 s | 60; 3,20 s |
| Odczyt zapisanego projektu | 324; 0,87 s | 324; 0,87 s |
| Przygotowanie i zamknięcie sesji poza ciałem testu | 6,74 s | 6,79 s |
| Cały profilowany przebieg | 24,86 s | 16,78 s |

Tryb jest teraz wybierany raz na przypadek przez rzeczywisty interfejs. W całym zestawie liczba wyborów spadła z 1158 do 117: usunięto 2082 kliknięcia w menu. Wszystkie pary punktów i sprawdzenia wartości oraz niezmienności geometrii pozostają. Dodano sprawdzanie, że każda para tworzy kolejny wymiar i że jego typ pozostaje właściwy. Osobny przypadek w `cad-point-behavior.test.cjs` nadal sprawdza ponowny wybór aktywnego trybu i zachowanie menu.

Ta zmiana odpowiada za główny zmierzony zysk. Wcześniejszy kosztowny zestaw stanowił około połowy sumy czasów zadań w wariancie 4-workerowym.

## 2. Błąd kolejności przy nowej liczbie workerów

`orderJobs` odczytywał historię tylko dla dokładnie wybranej liczby workerów; wyjątkiem był tryb `auto`, korzystający z historii dla 4 workerów. Po przejściu np. z 4 na 3 lub 6 workerów wszystkie zadania bez osobnych próbek stawały się nieznane, mimo dostępnych pomiarów. Porządek najdłuższe-pierwsze wtedy zanikał. Pusta tablica próbek również blokowała rezerwowy odczyt.

Nowy test odtworzył problem przed poprawką. Kolejność szacowania po poprawce:

1. Niepusta historia dla wybranej liczby workerów.
2. Niepusta historia dla domyślnych 4 workerów.
3. Historia dla najbliższej dostępnej liczby workerów.
4. Historia `auto`, jeśli jest jedyną dostępną.

Historia jest używana wyłącznie do kolejności. Nowe pomiary nadal trafiają do osobnych kategorii liczby workerów. Nowe zadania nadal startują wcześnie. Testy obejmują puste próbki, pierwszeństwo dokładnej historii, najbliższy wariant i zachowanie oryginalnych danych.

Poprawka ta nie wyjaśnia strat wcześniejszego benchmarku 1–6: tam wszystkie warianty dostały celowo ten sam porządek zadań. Chroni zwykłe uruchamianie z nową liczbą workerów. Jej osobnego wpływu na pełny czas nie wyizolowano.

## Pozostałe koszty i ocena podziału

- Przydział zadań był już wyrównany: poprzednia seria wykazała ponad 99% czasu z przydzielonym zadaniem, nawet przy 6 workerach. Samo zwiększenie liczby partycji nie usuwa stwierdzonego głównego kosztu.
- Cztery partycje największego pliku są zbliżone czasowo. Ich obecnego podziału nie zmieniano.
- W profilowanej partycji uruchomienie przeglądarki zajęło jedynie 0,165 s. Nie jest głównym bottleneckiem tej partycji. Pozostałe pliki mogą mieć inny udział tego kosztu.
- Przygotowanie i zamknięcie 30 świeżych sesji kosztuje około 6,7 s. To kolejny znaczący obszar do profilowania: obejmuje tworzenie kontekstu i strony, instalację pomiarów, nawigację i otwarcie pustego projektu przez UI. Podczas tej zmiany zachowano izolację sesji.
- Bezpośrednie kliknięcia punktów i rysowanie figur pozostają znaczącym kosztem. To rzeczywiste działania użytkownika potrzebne do weryfikacji E2E.
- Odczyty IndexedDB w profilowanej partycji kosztowały około 0,87 s. Ich optymalizacja ma znacznie mniejszy potencjał od usuniętych operacji menu.
- Wcześniejsza seria 1–6 pokazała wzrost czasu tych samych zadań przy większej równoległości. Przypisanie tego konkretnie CPU, GPU, IPC lub oczekiwaniu na klatki wymaga dokładniejszego profilu. Nie zakładano, że sam podział zadań rozwiąże ten problem.

## Końcowa weryfikacja

Zestaw celowany: 18 przypadków jednostkowych i 117 E2E, poprawny. Następnie wykonano pełne przebiegi końcowej wersji na 1 i 4 workerach. Każdy wykonał wszystkie 285 przypadków. Porównanie wersji i identyfikatorów przypadków pomiędzy tymi przebiegami jest zgodne. Nie było ponowień maskujących błędy.

| Workery | Czasy poszczególnych workerów | Suma pracy | CPU komputera średnie / szczyt | Ekwiwalent CPU średni / szczyt | Dostępne procesory logiczne |
|---:|---|---:|---:|---:|---:|
| 1 | 161,3 s | 161,3 s | 16,9% / 32,4% | 3,4 / 6,5 | 20 |
| 4 | 54,9 / 54,9 / 55,0 / 54,9 s | 219,7 s | 53,9% / 82,9% | 10,8 / 16,6 | 20 |

CPU dotyczy całego komputera. Ekwiwalent CPU nie oznacza liczby rzeczywistych wątków testów. Czasy workerów sumują odcinki z przydzielonym zadaniem, łącznie z oczekiwaniem na operacje; nie są czasem CPU. Ograniczeniem porównania pozostają pojedyncze pomiary i możliwa praca innych aplikacji.

Źródła:

- [Profil przed](test-runs/bottleneck-analysis/profile-before.json) i [profil po](test-runs/bottleneck-analysis/profile-after.json).
- [Zestawienie przed/po i kontrola zachowania przypadków](test-runs/bottleneck-analysis/comparison.json).
- [Pełna regresja: 1 worker](test-runs/run-Ofg7X9/summary.json).
- [Pełna regresja: 4 workery](test-runs/run-nnst7j/summary.json).

Domyślna liczba workerów pozostaje równa 4. Kod aplikacji nie został zmieniony w tym zadaniu.
