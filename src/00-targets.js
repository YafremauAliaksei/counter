
// =====================================================================
//  CELE TEMPA — SZTUK NA GODZINĘ, OSOBNO DLA KAŻDEGO DZIAŁU
//  ---------------------------------------------------------------
//  Na celu stoją dwie rzeczy:
//    - linia 10: procent bieżącego tempa od celu i cel na zmianę;
//    - linia 9 (czas od ostatniego pojemnika): czerwienieje po
//      podwójnym czasie przedmiotu, czyli 2 × 60 / cel minut.
//      Przy celu 30 przedmiot ma 2 minuty, linia czerwienieje po 4.
//
//  Zmiana ma PŁATNYCH_GODZIN godzin pracy: obiad (30 min) jest
//  niepłatny i do celu się nie wlicza. Przy celu 30 cel zmiany to
//  30 × 10 = 300 sztuk.
//
//  FAST pracuje na tej samej karcie co CRET (ten sam adres T-REX),
//  więc który z dwóch celów obowiązuje, wybiera się w panelu.
//  0 albo brak wpisu — działu bez celu: linia 9 tylko liczy czas.
// =====================================================================
const RATE_TARGETS = { CRET: 47, FAST: 80, UG: 47, REFURB: 30, WHD: 25 };
const PAID_SHIFT_HOURS = 10;
