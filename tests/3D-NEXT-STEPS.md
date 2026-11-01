# Pozostałe prace nad 3D

Aktualizacja: realizacja etapów 1–6 jest opisana w [3D-CHECKPOINT.md](3D-CHECKPOINT.md).
Poniższy opis stanu początkowego zachowano jako uzasadnienie planu.

Stan na 24 października 2026. To plan dalszych prac, nie ich wdrożenie.

Wykonane: niezależna kamera i zoom 3D, ikony, granice powierzchni oparte na
krzywych, pola liczone z krzywych, stabilne identyfikatory przy edycjach
zachowujących topologię i migracja starszych wyciągnięć. Ostatni zapisany przebieg:
36/36 zestawów testów, `3d-stage-1-results.txt`.

Główna zaległość to punkt 4: wydajność i stabilność renderowania. W aplikacji
nadal pracuje `PlanRaster` na Canvas 2D. Ruch myszy wywołuje renderowanie
bezpośrednio, a każda klatka tworzy bufory pikseli i głębokości oraz odbudowuje
reprezentację ścian. Rozpoznawanie krzywych jest już oddzielone od ich siatki;
nie należy ponownie realizować ukończonych punktów 1–3.

## Etap 1. Pomiary aktualnego stanu i regresja zawieszania

Zakres:

- Uaktualnić benchmark do obecnej wersji geometrii i kamery. Stare pomiary
  z researchu pozostają materiałem historycznym.
- Oddzielić pomiar obsługi zdarzenia, pracy CPU nad klatką, odstępów między
  prezentowanymi klatkami i opóźnienia reakcji interfejsu.
- Odtworzyć długi obrót jednej wyciągniętej powierzchni przez XY, XZ i YZ,
  w obu kierunkach i przez wielokrotne pełne obroty.
- Sprawdzić prostokąt, koło, półkole, otwór i układ pięciu obszarów z przykładu.
- Zachować rzeczywiste interakcje przeglądarkowe, DPR 1 i 2 oraz ten sam rozmiar
  okna do porównań. Rejestrować również błędy i długie zadania głównego wątku.

Wynik: powtarzalny punkt odniesienia i test wykrywający problem wydajności,
bez utożsamiania czasu pojedynczego handlera z FPS.

## Etap 2. Oddzielenie sceny od kamery

Zakres:

- Rozdzielić zmiany geometrii, topologii, siatki, wysokości wyciągnięcia,
  zaznaczenia, kamery i rozmiaru okna.
- Budować granice grup, ściany i dane wybierania po zmianie odpowiednich danych,
  zamiast przy każdym obrocie.
- Zastąpić sprawdzanie zmian przez serializację całej geometrii jawnie
  aktualizowanymi wersjami lub znacznikami zmian. Uwzględnić cofanie, ponawianie,
  zmianę rzutu, widoczność warstw i migrację.
- Łączyć żądania renderowania przez `requestAnimationFrame`. Renderować po
  zmianie widoku, bez ciągłego rysowania nieruchomej sceny.
- Zmieniać rozmiar bufora canvasu wyłącznie przy rzeczywistej zmianie rozmiaru
  lub DPR. Nie mieszać aktualizacji układu DOM z każdym przeliczeniem wierzchołka.

Wynik: obrót i zoom nie przebudowują geometrii ani topologii. Ten podział będzie
bezpośrednią podstawą renderera GPU.

## Etap 3. Siatka do wyświetlania i renderer WebGL 2

Zakres:

- Generować indeksowaną siatkę podstaw, ścian i otworów z istniejących
  geometrycznych granic powierzchni. Zachować powiązanie trójkątów z powierzchnią
  i operacją wyciągnięcia.
- Triangulować podstawy z otworami; sprawdzać obrysy z wklęsłościami,
  stycznościami i wspólnymi krawędziami. Porównywać pole siatki z polem krzywych
  z tolerancją wynikającą z przybliżenia.
- Dodać natywny WebGL 2, programy cieniujące, bufory wierzchołków i indeksów
  oraz sprzętowy test głębokości. Zachować płaszczyzny o grubości 0 i widoczność
  właściwą dla obrotów na drugą stronę szkicu.
- Utrzymywać siatki na GPU; podczas obrotu aktualizować transformację kamery.
  Zmiana zaznaczenia ma zmieniać wygląd, a zmiana wysokości tylko odpowiednie dane.
- Grupować rysowanie według materiału i rodzaju geometrii. Segmenty łuku nie
  mogą stawać się osobnymi obiektami użytkownika ani osobnymi wywołaniami GPU.
- Usunąć pełnoekranowe `getImageData`/`putImageData` i programowy bufor
  głębokości ze zwykłej ścieżki renderowania 3D.
- Zachować ikony, gizmo, uchwyt wyciągania, zoom, przesuwanie, prawy przycisk
  wyłączony i bieżące zasady historii.
- Obsłużyć brak WebGL i utratę kontekstu bez uszkodzenia projektu; edycja 2D
  i zapis mają pozostać dostępne. Nie utrzymywać dwóch równoległych rendererów
  modelowania jako docelowej architektury.

Wynik: poprawna wizualnie bryła z otworami i krzywymi, renderowana przez GPU.
Projekt nadal działa z trzech plików, bez CDN, backendu i procesu kompilacji.

## Etap 4. Wybieranie i manipulacja na nowym rendererze

Zakres:

- Wybierać najbliższą widoczną powierzchnię w przestrzeni 3D, z uwzględnieniem
  otworów, zasłonięcia i płaszczyzn widzianych pod małym kątem.
- Zachować Ctrl/Cmd do dodawania i odznaczania obszarów podczas wyciągania.
  Zaznaczenie ma pozostać powiązane z powierzchniami, nie z trójkątami siatki.
- Dopasować uchwyt do rzeczywistego kierunku normalnej i bieżącej kamery;
  sprawdzić skrajne ustawienia oraz zmianę zoomu podczas operacji.
- Unikać ciągłego odczytu pełnego obrazu GPU do wybierania. Dla większych scen
  zastosować indeks przestrzenny i dokładne sprawdzenie tylko kandydatów.

Wynik: poprawny wybór i płynna manipulacja bez powrotu do kosztów starego renderera.

## Etap 5. Szczegółowość krzywych i większe sceny

Zakres:

- Dobierać gęstość siatki łuków i Bézierów do rozmiaru na ekranie, z kilkoma
  zapamiętanymi poziomami jakości i histerezą. Mały ruch kamery nie powinien
  ciągle przebudowywać siatki.
- Zachować niezależność dokładności modelu, obliczania pól i siatki wyświetlania.
- Odrzucać obiekty poza kadrem i współdzielić bufory; stosować instancje dla
  rzeczywiście powtarzalnych obiektów.
- Jeżeli pomiary wykażą istotny koszt przebudowy geometrii, wydzielić ją do
  Workera i przekazywać bufory bez kopiowania. Nie traktować Workera jako
  zamiennika renderera GPU.

Wynik: liczba wyświetlanych szczegółów odpowiada potrzebnej jakości, a koszty
rosną wraz z rzeczywistą złożonością sceny.

## Etap 6. Odbiór wydajności i zgodności

- Zestawy: 1, 10, 100 i 1000 prostych obiektów oraz sceny mieszane z łukami,
  otworami i wieloma wyciągnięciami; jawna liczba trójkątów i wywołań rysowania.
- DPR 1/2, powtarzalne okno, sprzęt i ustawienia; osobne wyniki CPU i GPU,
  jeśli pomiar GPU jest dostępny bez blokowania normalnego rysowania.
- Proponowany cel na uzgodnionym sprzęcie: płynność 60 Hz, 95. percentyl pracy
  głównego wątku około 5–10 ms i brak zadań ponad 50 ms przy samym obrocie
  niezmienianej sceny. Wynik musi być zmierzony, nie wywnioskowany z liczby assetów.
- Brak przyrostu pamięci po wielokrotnych edycjach, usuwaniu obiektów i zmianie rzutu.
- Pełne testy jednostkowe i E2E: zaznaczanie, łuki, otwory, wyciąganie,
  cofanie/ponawianie, zapis, migracja, zoom i blokada prawego przycisku.

Warunek zakończenia: raport przed/po, brak błędów poprawności i zaliczone
uzgodnione kryteria płynności. Samo pojawienie się WebGL nie kończy zadania.

## Dalsze modelowanie po ustabilizowaniu 3D

To kolejny zakres funkcjonalny, nie część naprawy wydajności:

1. Ustalić hierarchię projektu: projekt → płaszczyzny podparcia → szkice →
   powierzchnie → operacje wyciągnięcia. Wiele powierzchni jednego szkicu
   nie oznacza wielu płaszczyzn podparcia.
2. Dodać tworzenie płaszczyzn w przestrzeni oraz określanie ich położenia
   i pochylenia. Pierwszy szkic nadal powstaje na domyślnej XY.
3. Dodać tworzenie i edycję kolejnych szkiców na wybranych płaszczyznach;
   przejście między widokiem na wprost aktywnego szkicu i widokiem przestrzennym.
4. Sprawdzić wyciąganie wzdłuż normalnej każdej płaszczyzny oraz zapis zależności
   i aktualizację operacji po zmianie płaszczyzny.
5. Dopiero na tej podstawie uporządkować nazwy obecnego „Rzutu 1” i elementów
   projektu. Nazwa płaszczyzny i nazwa szkicu nie powinny być utożsamione.

Kolejność realizacji: najpierw etapy 1–6 dotyczące wydajności, potem płaszczyzny
i kolejne szkice. Ten dokument nie rozpoczyna implementacji żadnego z etapów.
