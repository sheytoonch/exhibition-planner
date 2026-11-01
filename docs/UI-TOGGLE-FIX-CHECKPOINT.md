# Poprawka przełączania opcji i powrotu do 2D

Oba zgłoszenia najpierw odtworzono nieudanymi testami E2E.

- Jedna obsługa zamyka otwarte menu po drugim kliknięciu jego ikony. Stan przechwytywany jest przed automatycznym zamykaniem popovera przez przeglądarkę, aby ten sam klik nie otwierał go ponownie. Działa również dla aktywacji klawiaturą. Usunięto konkurującą obsługę stanu strzałek wariantów.
- Jawne przyciski 2D i 3D znajdują się przy prawym górnym rogu płótna. 2D wraca do edycji szkicu, 3D otwiera model, kliknięcie aktywnego trybu go nie zmienia. Kontrolki nie zajmują paska narzędzi. Inspektor wiązań ma odstęp od przełącznika.
- Testy dotychczasowego przełączania widoku korzystają z pomocnika klikającego odpowiedni przycisk 2D lub 3D. Asercje geometrii, kamery i wyciągnięć pozostają zachowane.
- Nowe przypadki sprawdzają powtórne kliknięcia i Enter dla menu rzutu, przyciągania, ustawień, widoczności, warstw i wariantów linii; widoczny powrót do 2D przy wysokościach 600/800 px; zachowanie istniejącego wyciągnięcia; dalsze rysowanie w 2D.

Pełna regresja zakończona poprawnie: 275 przypadków, w tym 55 jednostkowych i 220 E2E. Cztery workery: 63,9 / 64,0 / 64,4 / 64,0 s; suma pracy 256,3 s. Wszystkie przypadki wykonano offline, bez zrzutów ekranu i bez pomijania.
