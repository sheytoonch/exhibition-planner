# Rozmieszczenie opcji — checkpoint

Plan bazowy: `UI-CONTROL-PLACEMENT.md`. Cztery kroki wdrożenia.

## 1/4 — sterowanie widokiem

Przełącznik 2D/3D, orientacja, kamera/projekcja, kroki obrotu i zoom są w jednej kompaktowej grupie przy prawym dolnym narożniku płótna. Widoczność podkładu, wymiarów i siatki ma osobne menu widoku w 2D. Kąt jest dostępny przy obsłudze grupy zamiast stale w pasku edycji. Narzędzia zaznaczania powierzchni i wyciągania pozostały w pasku edycji. Nowy test najpierw potwierdził błędne rozmieszczenie trzech kontrolek w pasku.

## 2/4 — nawigacja i panele

Nowy rzut, podkład i ustawienia jednostek/dokładności są przy wyborze rzutu. Lista przygotowanych ścian jest w nagłówku, dostępna także z 2D; nazwy i wymiary pozostają czytelne. Warstwy mają ikonę panelu obiektów przy lewej dolnej krawędzi. Przycisk panelu obrazów znajduje się na jego krawędzi i zachowuje stan zwinięcia. Istniejące testy ustawień jednostek przechodzą przez nową lokalizację bez zmiany asercji geometrii.

## 3/4 — ikony i rozdzielenie ustawień

Usunięto podpisy pod ikonami narzędzi; zachowano ich dostępne nazwy. Polecenia ściany, pomiary, pusty obraz, warstwy, kamera, obrót, dodanie obrazu, zatwierdzenie pozycji i usunięcie mają SVG wspólnego stylu. Magnes oznacza przyciąganie, linia przerywana — geometrię pomocniczą, oko — widoczność. Jednostki i dokładność nie są już w przyciąganiu. Przeniesione pola zachowują właściciela formularza i zapis danych. Warianty narzędzi aktualizują również nazwę dostępności. Podpowiedzi działają przez title przy myszy i osobny tooltip dla fokusu klawiatury.

Testy wykryły nakładanie grupy widoku na menu zaznaczenia; menu przesunięto ponad tę grupę. Nie zmieniono geometrii, projekcji, obsługi wymiarów ani modelu historii.

## 4/4 — pełna regresja zakończona

Pełny przebieg dla końcowego kodu: 273 przypadki, w tym 55 jednostkowych i 218 E2E. Cztery workery: 63,4 / 63,4 / 63,5 / 63,4 s; suma pracy 253,7 s. Raport: `tests/test-runs/run-eGWr5l/summary.json`. Wszystkie przypadki zakończone poprawnie, bez pomijania.

Nowy test sprawdza rzeczywiste miejsca kontrolek, dostępne nazwy i SVG, zmianę projekcji oraz obrót przy czterech szerokościach, zapis siatki z menu widoku i niezmienioną geometrię. Rozszerzono sprawdzenie nawigacji po przygotowanych ścianach z 2D i podpowiedzi klawiatury. Zachowano wcześniejsze asercje wymiarów, umieszczania obrazów, wyciągania i zapisu. Testy działają offline i bez zrzutów ekranu.
