# Adaptacyjna liczba workerów

## 1/3 — mechanizm

Aktualna decyzja użytkownika: domyślnie stałe **4 workery** przez `node tests/cad-suite.cjs --all`. Opisany poniżej tryb adaptacyjny pozostaje opcjonalny przez `--workers auto`. Pomiary CPU i dostępności procesorów logicznych pozostają w każdym trybie.

- Początek: do 4 workerów. Sufit: 8, nie więcej niż dostępna równoległość minus dwa procesory logiczne (co najmniej 1).
- Pomiar co sekundę: wykorzystanie całego CPU przez różnice liczników idle/total oraz wolna pamięć fizyczna. Bez sieci i dodatkowych zależności.
- Trzy kolejne próbki poniżej 75% CPU i z rezerwą RAM pozwalają dodać jeden worker. Rezerwa: większa z 2 GiB i 15% RAM, plus 512 MiB przed zwiększeniem limitu.
- Dwie próbki powyżej 90% CPU lub poniżej rezerwy RAM obniżają limit o jeden. Brak wiarygodnego pomiaru też zmniejsza limit. Uruchomione testy kończą się normalnie; limit dotyczy nowych przydziałów. Minimalnie jeden worker zapewnia postęp.
- Blokady zasobów, kolejka i kompletność przypadków są wspólne dla trybu stałego i automatycznego. Wolne sloty nadal natychmiast pobierają kolejne zadania.
- Czasy auto zapisują się oddzielnie od stałych limitów; pierwsza kolejność auto korzysta z historii czterech workerów, dopóki nie ma własnych pomiarów. Historia nadal przechowuje pięć ostatnich poprawnych czasów zadania.
- Raport JSON zawiera próbki CPU/RAM, limity w czasie, liczbę faktycznie użytych slotów i podsumowanie obciążenia. Krótki raport terminala zachowuje dotychczasowy format.

Ręcznie: `--workers 1`, `--workers 4`, `--workers 8`. `--check` domyślnie oczekuje 4 workerów; zapisany wynik auto sprawdzaj przez `--check --workers auto`.

## 2/3 — testy mechanizmu

Testy jednostkowe obejmują wzrost ze stałym zapasem, hamowanie CPU/RAM, brak pomiaru, mały procesor, różnice liczników CPU, brak utraty zadań przy wzroście i zmniejszaniu limitu, osobną historię auto i kompletne raportowanie. Dotychczasowe testy blokad, błędów i brakujących przypadków pozostają obowiązujące.

## 3/3 — pełna walidacja porównawcza zakończona

Końcowe przebiegi 1 / 4 / auto mają identyczny fingerprint, wszystkie tożsamości przypadków i wyniki: 281 przypadków (61 jednostkowych, 220 E2E). Ścieżki raportów: `docs/ADAPTIVE-VALIDATION.json`. Ostatni pełny wynik auto: `tests/test-runs/run-aG13IV/summary.json`, potwierdzony przez `--check`.

Limit w auto zmieniał się 4 → 5 → 6 → 7 → 8 → 7. Użyto 8 slotów. CPU całego komputera: średnia próbek 77,2%, najwyższa próbka 100%; najmniej wolnego RAM: 15,8 GiB. Szczyt CPU spowodował ograniczenie nowych przydziałów. Pomiar nie stanowi twardego ogranicznika CPU: trwające zadania nie są przerywane.

Czasy pracy slotów auto: 56,3 / 56,3 / 56,3 / 56,9 / 53,2 / 50,7 / 39,2 / 31,0 s. Suma pracy 400,0 s. Przebiegi 1 i 4 wykonano równolegle w osobnych katalogach w celu weryfikacji przypadków, a nie benchmarku szybkości; auto uruchomiono po zakończeniu obu. Nie należy traktować ich czasów jako izolowanego porównania wydajności.

Walidację odtworzysz przez `node tests/validate-adaptive.cjs`. Skrypt odmawia równoległego porównania, jeśli zestawy zadeklarują współdzielone blokady zasobów. Po porównaniu 1/4 uruchamia auto osobno i sprawdza zgodność raportów. Nie ponawia nieudanych testów.

Podczas pierwszego porównania ujawniono brak oczekiwania na gotowy render w teście ściany. Odczyt liczbowych pikseli GPU oczekuje teraz na obecność ściany zamiast zakładać, że dwie klatki wystarczą. Nie osłabiono asercji geometrii i nie dodano ponawiania całych testów. Po zmianie wykonano wszystkie trzy końcowe przebiegi od nowa.

## CPU a worker

Odczyt lokalnego sprzętu: Intel Core i7-12700KF, 12 rdzeni fizycznych, 20 procesorów logicznych. Worker testów jest slotem harmonogramu, nie rdzeniem sprzętowym: uruchamia proces Node, a E2E dodatkowo procesy i wątki przeglądarki. Windows planuje te wątki na procesorach logicznych. Wątki logiczne mogą współdzielić zasoby fizycznego rdzenia, więc 20 wątków nie oznacza wydajności 20 niezależnych rdzeni.

Wykorzystanie CPU jest mierzone dla całego komputera, razem z innymi aplikacjami. Nie jest pomiarem samego wkładu testów. Mechanizm nie mierzy GPU ani temperatury i nie gwarantuje najkrótszego czasu; zapewnia ostrożne dostosowanie do CPU i RAM. Udany przebieg nie dowodzi braku każdego możliwego błędu.

Źródło API: [Node.js os](https://nodejs.org/api/os.html#oscpus), w tym liczniki CPU, dostępna równoległość i wolna pamięć.

## Rozszerzenie podsumowania zasobów

Podsumowanie terminala i JSON obejmuje teraz każdy tryb, nie tylko auto: liczbę użytych workerów, średnie/szczytowe CPU całego komputera, dostępne procesory logiczne podczas pomiarów (zakres, jeśli dostępność się zmienia) i obciążenie przeliczone na ekwiwalent procesorów logicznych. Ekwiwalent nie oznacza liczby faktycznych wątków przeglądarki ani zajętych rdzeni; uwzględnia również inne aplikacje. Brak danych jest jawnie oznaczany. Timer pomiaru jest zamykany również przy błędzie harmonogramu.

Pełna regresja po rozszerzeniu raportowania: 283 przypadki (63 jednostkowe, 220 E2E), wszystkie poprawne. Użyto 8 workerów; ich czasy: 58,2 / 57,4 / 58,3 / 58,2 / 54,4 / 51,3 / 48,2 / 43,0 s, suma 429,1 s. CPU średnio 75,5%, szczyt 96,9%; dostępnych 20 procesorów logicznych; ekwiwalent obciążenia średnio 15,1, szczyt 19,4. Testy jednostkowe sprawdzają przeliczenie, zmienną dostępność, brak danych i zapisywanie zasobów w trybie stałym oraz auto. Algorytm przydzielania zadań pozostał bez zmian.
