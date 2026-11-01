# Testy narzędzi CAD

Uruchomienie grup (lokalny Edge, bez widocznego okna):

```powershell
node --test tests/cad-01-drawing.test.cjs tests/cad-02-between-objects.test.cjs tests/cad-02-point-measurements.test.cjs tests/cad-point-behavior.test.cjs
```

Każdy przypadek otwiera osobny kontekst przeglądarki. Obiekty powstają przez
kliknięcia w interfejsie; testy nie wstawiają gotowej geometrii do pamięci aplikacji.
Weryfikujemy zapisane współrzędne, identyfikatory i powiązania, a nie tylko widoczność przycisku.

## 1. Wszystkie sposoby rysowania

11 przypadków: linia, linia z Shift, otwarta i zamknięta polilinia, prostokąt,
kwadrat z Shift, koło, łuk przez trzy punkty, łuk przez końce i punkt,
łuk ze środka i końców, krzywa Béziera. Każdy sprawdza geometrię oraz zapis po odświeżeniu.
Narzędzia edycji (przytnij, rozdziel, połącz, wydłuż i zmiany wierzchołków)
mają osobne istniejące testy `cad-editing.cjs` i `cad-editing-browser.cjs`.

## 2. Pomiary i wiązania między obiektami

13 przypadków, zawsze z dwoma obiektami narysowanymi w przeglądarce:

- Odstęp dwóch równoległych linii: prawidłowa wartość, zaczepienie linii
  pomocniczych w końcach i przeliczenie po zmianie współrzędnych drugiej linii.
  Ostatnia część wywołuje funkcję obliczającą wymiar na kopii geometrii;
  nie zastępuje testu przeciągania obiektów w interfejsie.
- Połączenie końców: linia–linia, linia–łuk i łuk–łuk.
- Pełna długość półokręgu: 100π jednostek; cięciwa: 200 jednostek.
- Trzy odległości proste między punktami łuku
  (początek–pośredni, pośredni–koniec, początek–koniec).
- Koniec osobnej linii do każdego z trzech punktów łuku.
- Dwie długości po części łuku: początek–pośredni
  i pośredni–koniec; każda ma wynosić 50π jednostek.

## Pomiary odległości między punktami dwóch obiektów

Celem jest sprawdzenie działania wymiarowania w aplikacji. Zestawienie par
obiektów i punktów służy wyłącznie do określenia przypadków testowych.
W komunikatach z przebiegu testów należy opisywać sprawdzane zachowanie,
np. „Sprawdzam pomiary poziome między końcami linii i punktami łuku”.

`cad-02-point-measurements.test.cjs` sprawdza poprawność odległości między
wskazanymi punktami dwóch obiektów oraz zachowanie ich geometrii.
Obejmuje 117 testów:

- 8 typów/wariantów: linia, polilinia, prostokąt, koło, trzy sposoby tworzenia
  łuku kołowego i Bézier.
- 36 nieuporządkowanych par, również dwa odrębne obiekty tego samego typu.
- Każda para ma 3 osobne testy: odległość prosta, rzut poziomy i rzut pionowy.
  To **108 testów para–pomiar**.
- Każdy taki test ma pętlę wszystkich kombinacji punktów referencyjnych:
  końce linii, 3 wierzchołki polilinii, 4 narożniki prostokąta, środek i 4 ćwiartki
  koła, 3 punkty łuku, końce i uchwyt Béziera. W sumie jest **1149 kombinacji
  punktów i pomiarów**, grupowanych w 108 testach, a nie liczonych jako osobne testy.
- Dodatkowo 3 sposoby tworzenia łuku × promień/średnica/długość łuku = **9 testów**.
  Sprawdzają rzeczywisty tekst liczbowy narysowany na canvasie oraz zapis po odświeżeniu.

Trzy pliki rysowania i pomiarów zawierają **141 testów bez TODO**.
108 testów pomiarów między parami obiektów wykonuje **1149 kombinacji punktów i pomiarów** przez interfejs,
sprawdza obliczoną wartość i brak deformacji obu obiektów.
Osobny `cad-point-behavior.test.cjs` dodaje **3 testy**: różne ikony i trwałość
trybu po zamknięciu menu; pomiar podążający za przeciąganym końcem linii wraz
z undo/redo i odświeżeniem; narysowanie, usunięcie i przywrócenie wymiaru fragmentu łuku.
`cad-tool-defaults.test.cjs` dodaje **6 testów** powtarzania ostatniego wariantu:
cztery sposoby tworzenia łuku (również po odświeżeniu), polilinia i wymiar poziomy
między punktami. Główna ikona uruchamia zapamiętany wariant, a osobna strzałka
otwiera menu wyboru. Wybór jest zapisywany lokalnie w przeglądarce.
Łączny zakres nowych testów: **150 przypadków**, bez oznaczeń TODO.
Nie ma tu pomiaru „po łuku” pomiędzy rozłącznymi obiektami: bez wskazanej ścieżki
taka długość nie jest zdefiniowana. Długości po łuku dotyczą jednego łuku.

Tryby `pointDistance`, `pointHorizontal`, `pointVertical` i `partialArcLength`
są dostępne w menu wymiarowania. Odwołania do punktów zawierają identyfikator
obiektu i nazwę punktu, dlatego wymiar przelicza się przy zmianie geometrii.
Są to pomiary informacyjne; nie narzucają nowych ograniczeń solverowi.
Wymiar fragmentu łuku jest osobnym łukiem wymiarowym, z liniami pomocniczymi
od wskazanych punktów. Jego etykietę można przeciągać, usunąć i cofnąć usunięcie.

Zakres nie obejmuje wszystkich wiązań ani długości po krzywej Béziera.
Koło ma testowany środek i ćwiartki, nie dowolny punkt obwodu.
Prostokąt jest parowany jako cały zestaw czterech narożników, mimo że aplikacja
zapisuje go jako cztery odcinki. Pozostałe dotychczasowe testy CAD uzupełniają te grupy.
