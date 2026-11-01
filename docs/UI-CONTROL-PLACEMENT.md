# Rozmieszczenie opcji i użycie ikon

Analiza wersji po pierwszym redesignie, 24.10.2026. Plan wdrożono w kolejnej zmianie; zakres i wynik pełnej regresji: [checkpoint wdrożenia](UI-CONTROL-PLACEMENT-CHECKPOINT.md). Opis „obecnej” wersji poniżej dotyczy stanu przed tym wdrożeniem.

## Wniosek

Zmniejszenie elementów nie rozwiązało mieszania funkcji. `.plan-actions` nadal zawiera narzędzia, operacje na projekcie, nawigację po ścianach i kontrolery widoku. Następna zmiana powinna poprawić ten podział, a dopiero potem usuwać podpisy. Przeniesienie samej „Kamery” pozostawiłoby ten sam problem przy przełączniku 3D, obrocie i widoczności wymiarów.

Przyjmujemy pięć stałych miejsc: nagłówek nawigacji, pasek narzędzi edycji, kompaktowy kontroler widoku przy płótnie, panel obiektów oraz ustawienia zaznaczenia. Nie tworzymy osobnego panelu dla każdej kategorii.

## Docelowa mapa

| Opcja obecna | Docelowe miejsce | Forma |
|---|---|---|
| Obrazy / Przestrzeń | Nagłówek | Krótkie nazwy głównych miejsc pozostają |
| Wybór rzutu | Nagłówek | Nazwa aktywnego rzutu i wybór innych |
| Nowy rzut | Przy wyborze rzutu | Ikona dokumentu z plusem |
| Dodaj grafiki, czyli podkład | Menu aktywnego rzutu | Obraz z plusem; opis „Dodaj podkład” w menu, aby odróżnić od dzieła na wystawę |
| Lista przygotowanych ścian | Nagłówek przy wyborze rzutu | Nazwa ściany jako część nawigacji; dostępna także w 2D |
| Nazwa / usuń rzut lub ścianę | Menu odpowiedniego obiektu w nagłówku | Wielokropek, działania nazwane w środku |
| Cofnij / ponów | Początek paska edycji | Dwie strzałki, to samo miejsce w rzucie i na ścianie |
| Zaznacz | Pasek edycji | Kursor |
| Linia, łuk, prostokąt, koło | Pasek edycji | Odpowiednie figury; warianty przy ich narzędziu |
| Przytnij | Pasek edycji | Jednoznaczne cięcie fragmentu; nie dodatkowy wariant ikony zaznaczenia |
| Długość / pomiary | Pasek edycji | Linia wymiarowa; warianty poziomy/pionowy w jednym menu |
| Wiązania / kąty | Narzędzie w pasku, wartości przy zaznaczeniu | Symbol kąta/wiązania; opisy konkretnych wiązań w menu |
| Pomocnicze / Pomocnicza | Opcje aktywnego narzędzia rysowania | Przerywana linia, przełącznik z widocznym stanem |
| Przyciąganie do obiektów i siatki | Grupa ustawień rysowania przy narzędziach | Magnes; szczegóły w jednym menu |
| Pokaż siatkę | Kontroler widoku, menu widoczności | Siatka z przełącznikiem |
| Pokaż wymiary | Kontroler widoku, menu widoczności | Linia wymiarowa z przełącznikiem; nie narzędzie tworzące wymiar |
| Pokaż podkład | Kontroler widoku, menu widoczności | Obraz z przełącznikiem |
| Jednostki i dokładność | Ustawienia rzutu | Ustawienie formatu, nie przyciągania; bez powtarzania jednostki na pasku |
| Warstwy | Kompaktowy panel obiektów otwierany ikoną stosu | Widoczność, blokada i zarządzanie warstwą w jednym miejscu; panel nie zasłania obiektu |
| 2D / 3D | Kontroler widoku | Krótkie oznaczenia 2D/3D; oddzielone od ikon zaznaczania powierzchni |
| Kamera / projekcja | Przy kontrolce orientacji | Ikona projekcji/kostki otwierająca ustawienia; nie aparat fotograficzny sugerujący zrzut |
| Obrót −45° / +45° | Przy kontrolce orientacji | Strzałki obrotu; krok 45° opisany w podpowiedzi/ustawieniu |
| Bieżący kąt | Przy kontrolce orientacji | Mała wartość podczas obsługi obrotu, bez stale zajmowanego miejsca w pasku edycji |
| Zoom / dopasuj | Kontroler widoku | Istniejące +, − i dopasowanie; spójna grupa z pozostałą obsługą widoku |
| Zaznacz powierzchnie | Pasek edycji 3D | Płaszczyzna z kursorem |
| Wyciągnij | Pasek edycji 3D | Płaszczyzna ze strzałką prostopadłą; wysokość tylko podczas operacji |
| Wybierz ścianę do wystawy | Pasek edycji 3D | Ściana z obrazem; odróżniona od zwykłego wyboru powierzchni |
| Potwierdź utworzenie ściany | Przy zaznaczeniu, tylko podczas przygotowywania ściany | Krótkie „Utwórz ścianę”, bez dodatkowego okna i instrukcji |
| Pusty obraz | Pasek edycji ściany | Ramka z plusem; wymiary ustalane na ścianie |
| Pokaż / ukryj obrazy | Krawędź prawego panelu | Ikona panelu bocznego; nie tekstowy przycisk pośród narzędzi rysowania |
| Pozycja / rozmiar / grubość obrazu | Przy zaznaczeniu: wymiary na płótnie i istniejący inspektor | Wartości i krótkie etykiety pozostają; ikonami nie zastępujemy znaczenia pól liczbowych |
| Usuń ze ściany | Przy zaznaczeniu / w inspektorze | Kosz, nie globalna akcja bez wskazanego obiektu |
| Dodaj obrazy | Biblioteka i nagłówek panelu obrazów | Obraz z plusem; inne miejsce i podpowiedź niż import podkładu |
| Motyw i skupienie na pracy | Koniec nagłówka | Istniejące ikony; bez wpływu na model |

## Zasady wyglądu i działania

- W głównym pasku edycji ikony SVG jednego stylu, bez podpisów pod rozpoznawalnymi narzędziami. Rozmiar rysunku około 20 px, pole kliknięcia 32 px. Usunięcie podpisu nie oznacza zmniejszenia pola trafienia.
- Każdy przycisk ma polską nazwę dostępną dla czytników i podpowiedź także przy fokusie klawiatury. Podpowiedź może zawierać istniejący skrót. Nie dodajemy fikcyjnych skrótów.
- W rozwiniętych menu pozostają krótkie nazwy. Nazwy ścian, obrazów i rzutu oraz edytowane liczby pozostają tekstem: są danymi użytkownika.
- Ikony zaznaczenia powierzchni, przygotowania ściany i zmiany widoku muszą być różne. Obecne trzy podobne symbole 3D są słabym rozróżnieniem zadania.
- Ustawienia widoczności to oko, przyciąganie to magnes, zarządzanie warstwami to stos. Nie łączymy ich pod ogólną „Precyzją”.
- Kontroler widoku zajmuje jeden stały narożnik płótna, łącząc istniejącą orientację i zoom zamiast tworzyć kolejny panel. Rozwinięte ustawienia są chwilowe i nie zasłaniają aktywnego obiektu ani edytowanego wymiaru. Szczegóły kamery znikają w widoku ściany.
- Menu warstw i biblioteka korzystają z dostępnego miejsca przy krawędzi. Nie otwieramy dwóch pełnych inspektorów obok siebie. Częste polecenia nie wymagają przechodzenia przez wielopoziomowe menu.

## Uzasadnienie zewnętrzne

Dokumentacja SketchUp opisuje orbitę, przesuwanie, zoom i projekcję jako operacje kamery/widoku. Uzasadnia to ich wspólne znaczenie, ale nie narzuca jednego położenia na ekranie. Umieszczenie ich przy kontrolce orientacji jest decyzją dla tej aplikacji i preferencji użytkownika. [Viewing a Model](https://help.sketchup.com/en/sketchup/viewing-model).

NN/G zwraca uwagę, że rozpoznawalność ikon zależy od doświadczenia użytkownika, i zaleca widoczne etykiety. Preferencją użytkownika tej aplikacji jest interfejs z przewagą ikon: świadomie stosujemy go w narzędziach, zachowując nazwy w menu i danych. Podpowiedzi i nazwy dostępności nie dowodzą same w sobie jednoznaczności symbolu. [Icon Usability](https://www.nngroup.com/articles/icon-usability/).

## Kolejność wdrożenia i sprawdzenia

1. Przenieść kompletną obsługę widoku: 2D/3D, kamerę, obrót, widoczność i zoom; nie tylko napis „Kamera”. Sprawdzić brak zmian geometrii, zachowanie kamery, kolizje i dostępność kontrolek przy czterech szerokościach.
2. Uporządkować nawigację i operacje na obiektach: rzuty, przygotowane ściany, nowy rzut, podkład, warstwy i uchwyt panelu obrazów. Zachować bezpośrednie przejście do ściany oraz jej nazwę.
3. Zastąpić podpisy narzędzi ikonami, ujednolicić warianty pomiaru i rozdzielić przyciąganie od widoczności. Sprawdzić nazwy dostępności, fokus, podpowiedzi i rozróżnialność stanów.
4. Wykonać pełną regresję przez istniejący runner. Testy mają wykonywać rzeczywiste kliknięcia w nowe miejsca, zachowując dotychczasowe asercje geometrii, wymiarów, umieszczania i zapisu. Sprawdzanie rozmieszczenia liczbowo, offline, bez zrzutów. Rozpoznawalność ikon wymaga również oceny przez użytkownika.

Sama analiza nie zmieniała kodu. Późniejsze wdrożenie przeszło pełną regresję opisaną w checkpoincie.
