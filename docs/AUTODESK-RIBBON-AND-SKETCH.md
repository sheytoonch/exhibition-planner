# Wstążka i metody szkicowania aplikacji

Interfejs grupuje istniejące polecenia według zadania: Rysuj, Modyfikuj,
Wymiary, Wiązania i Precyzja. Przełącznik Szkic 2D / Model 3D wybiera
kontekst; narzędzia powierzchni i wyciągania należą do modelowania.
Ikona wykonuje ostatnio wybrany wariant, a strzałka pod nią otwiera jego menu.
Zachowuj widoczne podpisy i przypisanie strzałki do własnego przycisku.
Na wąskim ekranie przewija się zawartość wstążki, nie cała strona.

## Metody i kolejność wskazań

- Okrąg: środek i promień, środek i średnica, dwa końce średnicy,
  trzy punkty obwodu, dwie proste i promień, trzy proste styczne.
- Łuk AutoCAD: początek, punkt na łuku, koniec.
- Łuk Inventor: początek, koniec, punkt na łuku.
- Pozostałe łuki: środek–początek–koniec, początek–środek–koniec,
  styczny od istniejącego końca, dwa końce i promień,
  środek–początek i podpisany kąt.
- Promień i średnica przyjmują centymetry; kąt przyjmuje stopnie.
  Instrukcja przy płótnie podaje następny krok. Escape anuluje konstrukcję.
- Metody okręgów stycznych obsługują obecnie proste, nie łuki ani okręgi.
  Wskazanie blisko oczekiwanego styku wybiera rozwiązanie spośród możliwych.

Nie jest to pełna kopia zestawu poleceń Autodesk. Zachowano istniejące
narzędzia aplikacji i dodano wspólne metody konstrukcji.

## Źródła Autodesk

- [Inventor: organizacja wstążki](https://help.autodesk.com/cloudhelp/2023/ENU/Inventor-Help/files/GUID-78BFC5E2-5323-48E3-A704-58DDD1836EFE.htm)
- [AutoCAD: podstawy obiektów 2D](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-OnBoarding/files/ACD_FOUNDATIONS_MAIN5.html)
- [Inventor: metody rysowania łuków](https://help.autodesk.com/cloudhelp/2024/ENU/Inventor-Help/files/GUID-4F861674-F74C-474E-869A-4C190ED6EC4B.htm)
- [AutoCAD: CIRCLE](https://help.autodesk.com/cloudhelp/2021/ENU/AutoCAD-Core/files/GUID-C60B6D5D-AAEB-420F-917F-6E6B47E92F48.htm)
- [Inventor: okręgi](https://help.autodesk.com/cloudhelp/2026/ENU/Inventor-Help/files/GUID-D489CE6D-7299-4211-A43A-F3580A4BA357.htm)

## Wskazówki do dalszych zmian

Przenoś istniejące węzły przycisków zamiast duplikować identyfikatory
i nasłuchiwanie zdarzeń. Po przeniesieniu do odłączonego fragmentu DOM
nie używaj getElementById, dopóki fragment nie wróci do dokumentu.
Nowej figurze nadaj ID przed dodaniem więzów do jej końców.
Obliczenia konstrukcji są w PlanSketchTools; obsługa wskazań, podglądu
i zatwierdzania pozostaje we wspólnym cyklu edytora.

Testy: sketch-methods.test.cjs sprawdza geometrię i przypadki niemożliwe;
ribbon-sketch.test.cjs wykonuje konstrukcje rzeczywistymi kliknięciami,
wpisuje wartości i sprawdza cofanie, więzy oraz etykiety.
workspace-ui.test.cjs chroni układ, kontekst 2D/3D i menu.

## Rozdzielenie etapów ekspozycji

Zakładki: Szkic 2D, Model 3D, Ściany ekspozycji, Układ ekspozycji.
Zatwierdzanie pojedynczej lub scalonej ściany pozostaje w tworzeniu ścian.
Układ otwiera ostatnio wybraną dostępną ścianę; bez ścian wraca do ich tworzenia.
Dwuklik istniejącej ściany w modelu otwiera układ i aktywuje jego zakładkę.
Powrót zachowuje ścianę do ponownego otwarcia, obrazy i pozostałe dane.
Pasek zakładek pozostaje dostępny również w widoku ściany.

## Fragmenty ściany

Najazd na nową płaszczyznę daje zieleń, na istniejącą ścianę jasny niebieski,
a zaznaczona istniejąca ściana jest mocniej niebieska. Pierwsze kliknięcie
istniejącej ściany wybiera jej fragmenty. Przyciski + Fragment / − Fragment
ustalają działanie kolejnych kliknięć. Zapis przelicza układ do nowego obrysu,
zachowuje identyfikator edytowanej ściany i odrzuca odjęcie zajętego obszaru.
Przy pokazywaniu warstwy SVG zmieniaj atrybut hidden, nie właściwość .hidden
(ta nie usuwa atrybutu w SVG).

## Wymiary obrysu ściany

PlanExhibition.wallDimensionChains wyznacza unikalne poziomy załamań
zewnętrznego obrysu po usunięciu współliniowych punktów. Nie powiela szwów
scalonych fragmentów ani wymiarów całkowitych prostokąta. Łańcuchy w obu
osiach leżą bliżej ściany, wymiar całkowity dalej. Jednostka cm pozostaje
przy wymiarze całkowitym, odcinki mają same wartości. Margines płótna
uwzględnia dwa poziomy podpisów. Obie osie muszą pokrywać pełny zakres,
a testy kontrolują ich sumę i położenie etykiet na różnych szerokościach.
