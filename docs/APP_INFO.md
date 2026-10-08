# tuur Funktionsübersicht

Stand: 8. Oktober 2026

tuur ist ein persönlicher Stadtguide für unterwegs. Die App verbindet Orte in der Umgebung, Karten und Wege mit lesbaren Ortsinformationen und optionalen KI-Audioführungen. Nutzer können frei losgehen, eine Route planen, unterwegs zwischen nächsten Zielen wählen oder eine vorhandene Tour starten.

Diese Übersicht beschreibt den aktuellen Funktionsumfang im Projekt, einschließlich Änderungen, die noch nicht in einer veröffentlichten App enthalten sind. Sie richtet sich an alle, die tuur verstehen, erklären oder testen möchten. Den konkreten Veröffentlichungsstand einzelner Builds und Dienste beschreibt [RELEASE.md](RELEASE.md).

## Inhalt

- [Produkt und aktueller Stand](#produkt-und-aktueller-stand)
- [Einstieg und Anmeldung](#einstieg-und-anmeldung)
- [Aufbau der App](#aufbau-der-app)
- [Die vier Tourmodi](#die-vier-tourmodi)
- [Karte und Entdecken](#karte-und-entdecken)
- [Texte und persönliche Audioführungen](#texte-und-persönliche-audioführungen)
- [Player und Begleitung unterwegs](#player-und-begleitung-unterwegs)
- [Kostenlose Nutzung und Bezahlfunktionen](#kostenlose-nutzung-und-bezahlfunktionen)
- [Downloads und Offlinebetrieb](#downloads-und-offlinebetrieb)
- [Gemeinsam unterwegs und Einladungen](#gemeinsam-unterwegs-und-einladungen)
- [Tourabschluss und Profil](#tourabschluss-und-profil)
- [Einstellungen und Datenschutz](#einstellungen-und-datenschutz)
- [Partnerangebote und Unternehmen](#partnerangebote-und-unternehmen)
- [Verwaltung und Qualitätssicherung](#verwaltung-und-qualitätssicherung)
- [Technischer Aufbau und Datenquellen](#technischer-aufbau-und-datenquellen)
- [Grenzen und typische Fragen](#grenzen-und-typische-fragen)
- [Weiterführende Dokumentation und Code](#weiterführende-dokumentation-und-code)

## Produkt und aktueller Stand

Das Grundprinzip ist eine Führung, die sich an Ort, Interessen, Sprache und Bewegung anpasst. Die App bietet kostenlose Texttouren und kostenpflichtige Audiofunktionen. Die Figur **Tuu** begleitet Einführung, Erklärungen und Stimmvorschauen.

| Bereich                    | Funktionsstand                                                                                                                                                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mobile App                 | Für iOS und Android angelegt; native Funktionen benötigen einen passenden App-Build. Die Konfiguration setzt iOS 16.4 beziehungsweise Android API 26 als Mindeststand.                                                                                                                                             |
| Sprachen                   | Deutsch und Englisch für die Oberfläche; die persönliche Führung nutzt die gewählte Sprache.                                                                                                                                                                                                                       |
| Darstellung                | Helles und dunkles Erscheinungsbild folgen dem System. Größere Schrift, Screenreader-Beschriftungen und reduzierte Bewegung werden berücksichtigt.                                                                                                                                                                 |
| Live-Beta                  | Begrenzter Datenbestand mit 21 kuratierten Orten in sechs Gebietskacheln in Berlin-Mitte. Die ursprünglich vorgesehene weltweite Erfassung ist dort nicht allgemein freigeschaltet.                                                                                                                                |
| Aktuelle Produktänderungen | Freie Texttouren, bezahlte Audiominuten, Stimmvorschauen, optionale Telefonverifizierung und KI-Einwilligung gehören zum aktuellen Projektstand. Veröffentlichte Clients und Backendstände können davon abweichen.                                                                                                 |
| TestFlight                 | Build 9 stammt aus einem früheren Stand und enthält nicht alle Änderungen vom 8. Oktober. Die Arbeit an einem Ersatzbuild und die Apple-Prüfung sind in der Release-Dokumentation festgehalten.                                                                                                                    |
| Vorschauen                 | Expo Go und die mobile Webvorschau besitzen angepasste Anbindungen und können je nach Konfiguration Demo- oder Firebase-Inhalte nutzen. Die dokumentierten veröffentlichten Vorschauen sind Demos. Simulierte Käufe, Sprachausgabe und Kartenverhalten sind kein Nachweis der entsprechenden nativen Livefunktion. |

## Einstieg und Anmeldung

Für die reguläre Nutzung ist ein Konto erforderlich. Die Anmeldung erfolgt mit **E-Mail und Passwort**, **Google** oder auf unterstützten Plattformen mit **Apple**. Ein anonymer technischer Benutzer ist kein vollständiger App-Zugang.

Eine Telefonnummer ist im aktuellen Code **keine allgemeine Voraussetzung** für Anmeldung, Texttouren oder bezahlte Audioführungen. Eine zusätzliche SMS-Verifizierung ist für bestimmte Gratis- und Reward-Freischaltungen vorgesehen. Die Beta beschränkt echte SMS-Verifizierung auf deutsche Telefonnummern. Ältere Builds können noch einen verpflichtenden Telefonschritt enthalten.

Das Onboarding erklärt die Führung und bietet die Auswahl von Sprache, Interessen und Standortfreigabe. Interessen sind optional; ohne Auswahl nutzt die App einen gemischten Vorschlag. Verfügbare Themen sind:

- Geschichte
- Architektur
- Kulinarik
- Kunst und Kultur
- Natur
- Geheimtipps
- Nachtleben
- Shopping

Die Standortfreigabe ermöglicht nahe Orte, Wegführung und das Auslösen passender Inhalte unterwegs. Hintergrundstandort wird gesondert benötigt, damit die ortsabhängige Begleitung bei gesperrtem Bildschirm weiterarbeiten kann. Ohne passende Freigabe zeigt die App die Einschränkung an.

Vor neuen persönlichen KI-Inhalten wird eine eigene Einwilligung abgefragt. Sie ist freiwillig; ohne Zustimmung bleiben kostenlose Quellentexte, Wege und bereits gespeicherte Aufnahmen verfügbar. Näheres steht unter [Einstellungen und Datenschutz](#einstellungen-und-datenschutz).

Ein typischer Start sieht so aus:

1. Anmelden und die Einführung abschließen.
2. Standort und gewünschte Interessen festlegen.
3. Unter **Entdecken** einen Modus oder Ort auswählen.
4. Kostenlos mit Texten starten oder Audio mit gültigem Zugang einschalten.
5. Der Karte folgen, Inhalte lesen oder hören und die Tour bei Bedarf pausieren.
6. Die Tour beenden und den Rückblick im Profil ansehen oder teilen.

## Aufbau der App

| Bereich                           | Funktion                                                                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Entdecken**                     | Umgebungskarte, nahe Orte, Einstieg in Explore, Routenplanung und Weggabelung. Während einer Tour zeigt die Startseite die laufende Aktivität. |
| **Offline**                       | Gespeicherte Touren, Downloadstatus, Speicherbedarf, Öffnen, Wiederholen fehlgeschlagener Downloads, Löschen und GPX-Export.                   |
| **Profil**                        | Tourverlauf, Statistiken, Stadt-Badges und Zugang zu Einstellungen.                                                                            |
| **Player**                        | Aktuelle Station, Karte und Weg, Texte oder Audiosteuerung, Touraktionen und gegebenenfalls Gruppenfunktionen.                                 |
| **Tourübersicht und Tourdetails** | Vorhandene Touren mit Beschreibung, Dauer, Strecke, Stationen, Vorschau, Start und Download.                                                   |
| **Preise und Freischaltung**      | Guthaben, verfügbare Käufe, Premium, Stimmvorschau und Wiederherstellung von Käufen.                                                           |

Die Startseite legt den Schwerpunkt auf individuelle Tourmodi. Vorhandene Standardtouren besitzen eigene Listen- und Detailansichten; sie sind nicht die zentrale Kartenliste der Startseite.

## Die vier Tourmodi

### Explore und Streifzug

Explore wird im Code auch `roam` und in älteren Texten „Streifzug“ oder „Just Roam“ genannt. Es ist der Modus für einen offenen Spaziergang.

- **Direkt los** wählt einen geeigneten nahen Ort als ersten Anlaufpunkt.
- Alternativ lässt sich ein vorgeschlagener Ort selbst auswählen oder **ohne Ziel losgehen**.
- Die App berücksichtigt Standort und Bewegungsrichtung und sucht interessante Orte entlang des weiteren Weges.
- Wiederholungen bereits behandelter Orte werden vermieden.
- Weitere Ziele erscheinen als freiwillige Vorschläge. Wer keine Auswahl trifft, kann weitergehen; die automatische Entdeckung läuft weiter.
- Eine neue Zielauswahl wartet gegebenenfalls, bis die laufende Geschichte abgeschlossen ist.
- Auch im Vorbeigehen tatsächlich gehörte Geschichten können als Tourstationen im Verlauf erhalten bleiben.

Die Einstellung „wenig“, „normal“ oder „viel erzählen“ beeinflusst die Häufigkeit der Begleitung. Neue Orte und Inhalte benötigen eine Verbindung und verfügbare Gebietsdaten.

### Geplante Route

Der Planer stellt eine Route aus geeigneten Stationen zusammen. Wählbar sind aktuell **30, 60, 90, 120 oder 180 Minuten** sowie **zu Fuß** oder **mit dem Fahrrad**.

Nutzer können eine Rundtour oder einen verfügbaren Ort als Ziel wählen, Interessen anpassen und Stationen hinzufügen oder entfernen. Vor dem Start zeigt die App eine Vorschau mit Stationen und Strecke. Die Zusammenstellung berücksichtigt Wegezeiten und Aufenthaltszeit an den Orten.

Eine geplante Route ist eine feste Abfolge von Stopps. Sie kann bei entsprechender Berechtigung heruntergeladen oder als Gruppentour verwendet werden. Eine laufende Solotour kann in Explore übergehen; bereits erlebte Stationen und die laufende Geschichte bleiben dabei erhalten. Der Wechsel aus einem Offlinearchiv in Online-Explore prüft den Onlinezugang neu.

### Weggabelung

Bei der Weggabelung, im Code `fork` oder „Crossroads“, entsteht die Tour durch Entscheidungen unterwegs.

- Auswahl eines Zeitrahmens von **60, 90 oder 120 Minuten**.
- Der Modus plant Fußwege.
- Die App bietet normalerweise zwei unterschiedliche nächste Orte mit Bild, Information, Entfernung beziehungsweise Gehzeit und Vorschautext an.
- Ein Tipp auf eine Karte zeigt Ortsinformationen; die gesonderte Navigationstaste wählt den nächsten Ort.
- Interessen, verbleibende Zeit und bisherige Stationen beeinflussen die Auswahl.
- Bei zu wenigen geeigneten Orten können weniger Vorschläge verfügbar sein.

Dieser dynamische Modus ist keine vollständig vorab herunterladbare Route.

### Standardtour

Standardtouren sind bereits zusammengestellte, automatisch erzeugte oder bearbeitete Touren eines Gebiets. Die Detailansicht zeigt Titel, Beschreibung, Dauer, Strecke und Stationen. Der Player führt durch die gespeicherte Reihenfolge.

Das Backend kann aus ausreichend belegten Orten Standard- und Thementouren erstellen. Ihre Verfügbarkeit hängt vom jeweiligen Datenbestand und der aktivierten Backendkonfiguration ab. Die aktuelle Beta bietet damit keine weltweite Tourbibliothek.

## Karte und Entdecken

Die Karte zeigt eigene Position und Richtung, interessante Orte, aktuelle und besuchte Stationen sowie die Tourroute. Kategorien haben wiedererkennbare Farben und Symbole. Partnerorte sind entsprechend gekennzeichnet.

Ortskarten verbinden Foto, Name und Entfernung mit einer lesbaren Rückseite. **Tippen auf die Karte** öffnet Informationen; die **Navigationstaste** startet oder ändert das Ziel. Bilder und Quellentexte haben eigene Quellen- und Lizenzangaben. Fehlende Fotos oder Beschreibungen werden nicht durch erfundene Ortsinformationen ersetzt.

Während der Navigation richtet sich die Karte nach der Bewegungsrichtung aus. Manuelles Verschieben oder Drehen unterbricht das automatische Folgen; die Standorttaste zentriert die Ansicht erneut. Für aktive Wege nutzt der Liveanbieter Straßen- und Weggeometrie für Fuß- oder Radstrecken. Abweichungen können eine neue Berechnung auslösen. Bei Routingfehlern zeigt die App einen Fehler- oder Wiederholungszustand.

Die Umgebung kann außerdem aggregierte Entdeckerzahlen und beliebte Orte anzeigen. Das sind keine Livepositionen anderer Personen und keine Freundeskarte.

### Pause finden

Über das Aktionsmenü oberhalb der Standorttaste lassen sich **Pause finden** sowie während einer Tour **pausieren oder fortsetzen** aufrufen.

Die Pausensuche umfasst:

- Kaffee und Gebäck
- Essen
- Orte zum Durchatmen, etwa Parks, Gärten, Bänke oder Picknickplätze

Sie verwendet vorhandene Ortsdaten im Umkreis von bis zu **1,5 km Luftlinie** und sortiert passende Ergebnisse nach Nähe. Es gibt keine Zusage zu aktuellen Öffnungszeiten, freien Plätzen oder Verfügbarkeit.

**Weg in Google Maps öffnen** pausiert die laufende Tour und öffnet externe Fußwegnavigation. Die Pausenstation verändert die ursprüngliche Tour nicht und zählt nicht automatisch als erzählte Station. Nach der Rückkehr wird die Tour bewusst fortgesetzt. Scheitert das Öffnen, stellt die App den vorherigen Pausenzustand wieder her.

## Texte und persönliche Audioführungen

### Kostenlose Ortsinformationen

Textmodus, Infokarten und Onlinewegführung sind kostenlos. Die Ortsinformationen stammen aus verfügbaren Quellen, etwa Wikipedia-Auszügen, OpenStreetMap-Beschreibungen oder kuratierten Fakten.

Fehlende Wikipedia-Auszüge können bei Bedarf nachgeladen werden. Dieser Abruf verwendet **keine Textgenerierung und keine Sprachsynthese** und benötigt kein Audiominutenbudget. Die Karte zeigt Quellen und Lizenzen; gekürzte beziehungsweise aufbereitete Wikipedia-Auszüge werden entsprechend bezeichnet. Bei fehlenden Quellen oder einem Abruffehler gibt es einen leeren Zustand beziehungsweise eine Wiederholungsmöglichkeit.

Kostenlose Quellentexte und persönliche KI-Erzählungen sind unterschiedliche Inhalte. Andere Funktionen wie Routenbeschreibungen oder Vorschautexte können trotzdem KI verwenden.

### Persönliche Erzählungen

Eine Audioführung verbindet die Stationen über einen gemeinsamen Erzählrahmen mit Einstieg, Übergängen und Abschluss. Die Inhalte berücksichtigen Orte, Reihenfolge, Interessen und Sprache. Die Textgenerierung soll ausschließlich belegte Fakten verwenden; Quellen und Prüfungen verringern Fehler, garantieren jedoch keine Fehlerfreiheit.

Jeder eigenständige neue persönliche Tourstart und jeder neue persönliche Download erhält eine eigene Erzählungsinstanz. Fortsetzen, Wiederholen einer Anfrage oder Abspielen desselben Downloads behält diese Instanz. Persönliche Aufnahmen sind dem Konto und der Tour zugeordnet; sie sind kein allgemein geteilter Orts-Audiocache. Eine Livegruppe verwendet ausdrücklich die Aufnahmen des Gastgebers.

Die Begleitung passt Länge und Auslösezeitpunkt an Bewegung und Entfernung an. Vorgesehen sind kurze, mittlere und lange Fassungen mit Richtwerten von **30 Sekunden, 90 Sekunden und 3 Minuten**. Bei schnellerer Bewegung kommen kürzere Geschichten zum Einsatz. Übergänge sollen an geeigneten Absatzgrenzen erfolgen. **Mehr erfahren** kann eine längere Fassung ergänzen, wenn der aktuelle Zustand dies erlaubt.

### Stimmen und Vorschauen

| Stimme    | Charakter                |
| --------- | ------------------------ |
| **Mara**  | Warm und lebendig        |
| **Jonas** | Ruhig und erzählend      |
| **Linus** | Freundlich und verspielt |

Sprache und Stimme lassen sich in den Einstellungen wählen. Die genaue Sprachsynthese hängt von der Backendkonfiguration ab. Hinter Linus steht aus Kompatibilitätsgründen teilweise noch die interne Kennung `lina`.

Für Deutsch und Englisch sind feste Stimmvorschauen in der App gebündelt. Ihr Abspielen erzeugt keine neue Aufnahme und verbraucht keine Audiominuten. Die Kaufansicht und die Einführung einer kostenlosen Tour verwenden diese Vorschauen mit animierten Tuu-Szenen. Im aktuellen Code lässt sich die Einführung sofort überspringen; das Ende einer Vorschau startet die Tour nicht automatisch.

## Player und Begleitung unterwegs

Der Player zeigt die aktuelle Station, Foto- und Infokarten, Karte, Route und Tourfortschritt. Je nach Modus und Zustand stehen folgende Aktionen bereit:

- Textmodus nutzen oder Audio freischalten und einschalten.
- Wiedergabe beziehungsweise Tour pausieren und fortsetzen.
- Zur vorherigen oder nächsten Station wechseln oder eine Station überspringen.
- Das Transkript öffnen; eine optionale Wortmarkierung folgt der Wiedergabe.
- Mehr zu einem Ort erfahren und Quellen oder Bildnachweise ansehen.
- Eine fehlerhafte Erzählung melden.
- Die laufende Tour auf der Startseite weiter begleiten lassen oder ausdrücklich beenden.
- Bei geeigneten Online-Routen eine Gruppe starten oder verwalten.

Die App kann eine unterbrochene Tour aus einem bis zu 24 Stunden alten, lokal gespeicherten Zwischenstand desselben Kontos wiederherstellen. Auf der Startseite lässt sich dieser fortsetzen oder verwerfen. Dabei werden Route, Fortschritt, Erzählungsinstanz und erforderlicher Zugang berücksichtigt. Ein App-Neustart ist keine Zusage für lückenlose Wiedergabe während der Unterbrechung.

Im nativen Build sind Hintergrundwiedergabe sowie Sperrbildschirm- und Kopfhörersteuerung vorgesehen. Standortabhängige neue Inhalte bleiben von der Standortfreigabe und den Betriebssystembedingungen abhängig.

### Live Activity auf dem iPhone

Ein passender nativer iOS-Build kann eine laufende Tour auf dem Sperrbildschirm und auf unterstützten iPhones in der Dynamic Island anzeigen. Sichtbar sind unter anderem Station, Status, Fortschritt und die verbleibende Entfernung entlang der berechneten Route. Ein Tipp führt zum Player.

Fehlende oder veraltete Standort- und Routingdaten werden als entsprechender Status angezeigt. Beenden einer Tour entfernt ihre Live Activity. Die Funktion benötigt keine zusätzliche Pushfreigabe; sie ist in Expo Go, Android und Web nicht verfügbar. Reale Darstellung und Hintergrundaktualisierung müssen auf einem geeigneten iPhone geprüft werden.

## Kostenlose Nutzung und Bezahlfunktionen

### Was kostenlos ist

Online-Texttouren, Quellentexte, Ortskarten und Navigation benötigen keinen Audiokauf. Neue Touren ohne Premium starten grundsätzlich im Textmodus. Textmodus und feste Stimmvorschauen verbrauchen keine Audiominuten.

### Credits und Premium

Die folgenden Eurobeträge sind die aktuell dokumentierten Produkt- und Demowerte. **Beim echten Kauf gelten die im jeweiligen Store angezeigten lokalisierten Preise und Bedingungen.**

| Produkt                   | Projektpreis     | Enthaltene Leistung                                                                                      |
| ------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------- |
| Ein Credit                | 1,99 €           | 90 aktive Audio-Tourminuten                                                                              |
| Fünf Credits              | 7,99 €           | Insgesamt 450 aktive Audio-Tourminuten                                                                   |
| Premium monatlich         | 9,99 € pro Monat | 500 aktive Audio-Tourminuten pro UTC-Kalendermonat, werbefreie Nutzung und Zugang zu Downloads           |
| Premium jährlich          | 59,99 € pro Jahr | Ebenfalls 500 aktive Audio-Tourminuten pro UTC-Kalendermonat, werbefreie Nutzung und Zugang zu Downloads |
| Zusätzlicher Gruppenplatz | 0,49 €           | Ein zusätzlicher Platz in der zugeordneten Gruppe, innerhalb der Gruppengrenze                           |

**Aktive Audio-Tourzeit** meint die Zeit, in der die Audioführung aktiv läuft, einschließlich der Wege zwischen gesprochenen Abschnitten. Sie ist nicht auf die reine Laufzeit der Sprachdateien begrenzt. Pausieren und Textmodus stoppen den entsprechenden Verbrauch. Die App zeigt verbleibende Zeit beziehungsweise den angehaltenen Zustand an.

Ein Credit wird für eine konkrete Standardtour oder für eine ortsbezogene Sitzung der dynamischen Modi eingelöst. Das freigeschaltete Zeitbudget ist damit an diesen Nutzungskontext gebunden. Pausen verbrauchen es nicht und lösen im neuen Minutenmodell keinen Ablauf nach 24 Stunden aus. Pro Konto kann eine kostenpflichtige Online-Audiotour aktiv sein; vor einer anderen wird sie pausiert.

Premium-Minuten werden je UTC-Kalendermonat erneuert und nicht in den nächsten Monat übertragen. Das Jahresabo stellt kein frei über das ganze Jahr verteilbares Jahreskontingent bereit. Weitere Credits werden nicht ohne ausdrückliche Aktion automatisch ausgegeben. Käufe und Berechtigungen werden serverseitig geprüft; die Kaufansicht bietet auch **Käufe wiederherstellen** und den Zugang zur Aboverwaltung im Store.

Ältere dauerhaft gekaufte Tourrechte und ältere bezahlte Freischaltungen werden kompatibel behandelt. Die früheren allgemeinen Aussagen „unbegrenzt mit Abo“, „ein Credit bedeutet dauerhaft eine Tour“ oder „24 Stunden pro neuem Credit“ beschreiben das aktuelle Minutenmodell nicht.

### Werbung und Gratisfreigaben

Vor einer neuen kostenlosen Tour kann nach der Stimmvorstellung eine Anzeige versucht werden. Ist keine Anzeige verfügbar oder lassen die Datenschutzeinstellungen keine zu, darf das den Start der Texttour nicht blockieren.

Zusätzliche Anzeigen zwischen Stationen sind auf geeignete Pausen im Textmodus begrenzt: mindestens acht Minuten Abstand, mindestens zwei besuchte Stopps seit der letzten Anzeige und eine Grenze von vier Anzeigen in der täglichen Frequenzzählung. Startanzeigen werden in dieser Zählung berücksichtigt, unterliegen selbst aber nicht dieser Begrenzung. Es gibt daher keine allgemeine Zusage von höchstens vier Anzeigen insgesamt pro Tag. Anzeigen sollen weder laufende Erzählungen unterbrechen noch Premium-Nutzern angezeigt werden. Werbeeinstellungen sind in der App zugänglich.

Das Backend enthält außerdem ältere Gratis-Stadttour- und Reward-Freigaben mit serverseitiger Prüfung; die aktuelle Kaufansicht bietet keinen Rewarded-Ad-Kaufweg an. **Eine kostenlose Freigabe oder das Ansehen einer Werbung schaltet nach dem aktuellen Modell kein neues bezahltes Audio und keine Downloads frei.** Bestimmte dieser Zusatzfreigaben erfordern eine verifizierte Telefonnummer.

Die tatsächliche Auslieferung echter Anzeigen setzt die Freigabe und Konfiguration des Werbedienstes voraus. Laut aktuellem Releaseprotokoll ist die AdMob-Kontofreigabe noch offen; funktionierender Testcode bedeutet daher keine gesicherten Werbeeinnahmen.

## Downloads und Offlinebetrieb

Downloads sind für **feste Standardtouren und geplante Routen** vorgesehen. Explore und Weggabelung benötigen laufend neue Auswahlentscheidungen und sind keine vollständig vorbereiteten Offline-Touren.

Ein Download speichert eine Tourkopie mit Route, Stationen, Texten, persönlichen Audiovarianten und Übergängen. Bilder werden soweit verfügbar mitgespeichert. Offline-Kartenkacheln können hinzukommen, wenn ein geeigneter Kartenanbieter entsprechend konfiguriert ist.

Für einen neuen Download ist eine passende **bezahlte Berechtigung** nötig: etwa aktives Premium oder ein geeigneter bezahlter Tourzugang. Gruppen-, Geschenk-, Reward- oder Gratiszugang allein reichen nicht. Im Minutenmodell wird die maßgebliche Tourdauer vor der Vorbereitung einmal vom verfügbaren Kontingent reserviert. Reicht die Zeit nicht, beginnt die Vorbereitung nicht. Eine gleichzeitig laufende kostenpflichtige Audiotour muss zuvor pausiert werden.

Der Ablauf ist:

1. Eine feste Tour öffnen und **Herunterladen** wählen.
2. Bei Bedarf den passenden Kauf beziehungsweise Zugang herstellen.
3. Die Vorbereitung und den Downloadfortschritt abwarten; fehlende Inhalte können erst erzeugt werden müssen.
4. Unter **Offline** die gespeicherte Tour mit **In tuur öffnen** starten.

Die Bibliothek zeigt Fortschritt, Fehler und Speicherbedarf. Unterbrochene Downloads lassen sich erneut versuchen. Vor dem Öffnen wird die Vollständigkeit erforderlicher Audiodateien geprüft; unvollständige Archive sollen als reparaturbedürftig erkennbar sein. Wird eine neue Vorbereitung wegen fehlender Minuten abgelehnt, bleibt ein vorher vorhandenes vollständiges Archiv erhalten.

Ein vollständiger gespeicherter Download bleibt lokal abspielbar, auch wenn der Onlinezugang oder das Abo später endet. Seine Wiedergabe verbraucht keine weiteren Audiominuten. Die gespeicherte Sprache, Stimme und Aufnahme gehören zum Archiv; es wird beim Öffnen nicht automatisch in eine andere Sprache umgewandelt. Die Bibliothek ist an das Konto gebunden; ein Kontowechsel macht die Archive des vorherigen Kontos nicht für das neue Konto verfügbar.

**Eine gespeicherte Route ist noch keine heruntergeladene Hintergrundkarte.** Vollständige Basiskarten benötigen eine passende Offline-Kachelquelle. Neue Orte, neue Wege, Käufe, Gruppenzugänge und neue Audioerzeugung sind ohne Verbindung nicht generell verfügbar.

Die native App verwendet dauerhaften Dateispeicher. Die Webvorschau hält Downloads nur im Arbeitsspeicher; sie ist keine dauerhaft gespeicherte Offlinebibliothek. Expo Go kann bei passender Firebase-Anbindung echte Audiodateien dauerhaft speichern, besitzt aber keine MapLibre-Offlinekarten.

Als zusätzliche Exportfunktion gibt es **GPX** für vollständige Downloads. Die Datei enthält geplante Route und Stationen, keine Audiodateien und keine Kontodaten. Der Export ist von der Wiedergabe in tuur und vom Teilen des tatsächlich aufgezeichneten Spaziergangs zu unterscheiden.

## Gemeinsam unterwegs und Einladungen

### Livegruppen

Eine Livegruppe gehört zu einer laufenden **Online-Standardtour oder geplanten Route**. Der Gastgeber erstellt einen Link; andere angemeldete Personen treten der Gruppe auf ihren eigenen Geräten bei.

| Regel              | Aktueller Umfang                                                                |
| ------------------ | ------------------------------------------------------------------------------- |
| Grundgröße         | Gastgeber und zwei Freunde, also drei Personen                                  |
| Premium-Gastgeber  | Zwei weitere Plätze, also fünf Personen insgesamt                               |
| Zusätzliche Plätze | Kaufbar bis maximal acht Personen insgesamt                                     |
| Laufzeit           | Bis zum Gruppenende, spätestens nach zwölf Stunden                              |
| Audio              | Gleicher Erzählrahmen, gleiche Sprache, Stimme und Aufnahmen wie beim Gastgeber |
| Minuten            | Nur die aktive Audio-Tourzeit des Gastgebers wird belastet                      |
| Downloads          | Gruppenmitgliedschaft gibt kein eigenes Downloadrecht                           |

Gäste erhalten die Aufnahmen des Gastgebers und erzeugen keine privaten Varianten. Ist eine Aufnahme noch nicht verfügbar oder der Gastgeber pausiert, kann ein Wartezustand auftreten. Beim Ende der Gruppe wird die Gastwiedergabe angehalten. Verlässt der Gastgeber die Gruppe oder eröffnet eine neue, endet die bisherige Gruppe für alle. Ein Gruppenlink überträgt keine dauerhafte Tourberechtigung.

Gemeinsame Aufnahmen bedeuten nicht automatisch sekundengenau synchronisierte Wiedergabe auf allen Geräten. Standort, Verbindung und Gerätezustand können die Wiedergabe beeinflussen.

Gruppeneinladungen sind beim Abspielen eines Offlinearchivs nicht verfügbar. Die Freigabe zusätzlicher gekaufter Plätze wird dem betreffenden Kauf zugeordnet; verzögerte Kaufbestätigungen sollen ohne erneuten Kauf wiederaufgenommen werden können. Noch nicht für eine Gruppe eingelöstes Platzguthaben bleibt verfügbar.

### Ältere Tourgeschenke

Neben Livegruppen existiert ein Einladungsmechanismus für ältere dauerhaft mit bezahltem Credit erworbene Tourrechte. Dafür sind bis zu zwei einmal einlösbare Einladungen für genau diese Tour vorgesehen; der Einladungslink gilt 30 Tage. Das Geschenk gewährt keinen Downloadzugang. Neue zeitbasierte Credits lassen sich nicht als solche Tourgeschenke weitergeben. Einladungs- und Gruppenlinks sind unterschiedliche Funktionen.

## Tourabschluss und Profil

**Tour beenden** schließt die laufende Aktivität ab und öffnet den Rückblick. Dieser kann folgende Inhalte anzeigen:

- tatsächlich aufgezeichneten Weg auf einer Karte
- Dauer, Entfernung und Bewegungstempo
- besuchte beziehungsweise erkundete Stationen
- gespeicherte schriftliche Geschichten zum erneuten Lesen
- erworbene Stadt-Badges
- eine teilbare Übersicht mit Route und Kennzahlen

Gespeicherte Stationsgeschichten lassen sich sowohl während einer Tour als auch später im Rückblick öffnen, ohne die Navigation oder Wiedergabe zu verändern. Für ältere Einträge ohne gespeicherte Geschichte können vorhandene Quellentexte geladen werden; das erzeugt keine neue persönliche Erzählung.

Optional kann die teilbare Karte **bis zu vier Fotos aus dem Zeitraum der Aktivität** enthalten. Erst nach einer ausdrücklichen Auswahl wird Fotozugriff angefragt. Fotos können vor dem Teilen geprüft, entfernt oder ganz weggelassen werden. Die Auswahl wird nicht als Tourverlauf gespeichert und nicht von tuur hochgeladen. Beim Teilen entscheidet der Nutzer selbst über die Ziel-App. Im Browser kann stattdessen eine Textfreigabe verwendet werden.

Das Profil zählt Touren, Stationen und Städte. Stadt-Badges bauen auf lokal erfassten Touren auf; die Stufen liegen bei **einer Tour für Bronze, drei für Silber und sieben für Gold**. Sie sind keine weltweit überprüften Leistungsnachweise.

Der Tourverlauf und seine GPS-Aufzeichnung bleiben auf dem Gerät; ein kontoweiter Cloudabgleich ist dafür nicht implementiert. Die lokale Liste hält bis zu 200 Touren. Eine Tour lässt sich per Wischgeste oder zugänglicher Löschaktion entfernen. Dadurch ändern sich auch die zugehörigen Statistiken und Badges. Ein gesonderter Download bleibt erhalten und eine laufende Tour wird dadurch nicht beendet.

## Einstellungen und Datenschutz

### Persönliche Einstellungen

- Sprache, Guide-Stimme und Interessen
- Häufigkeit der Erzählungen
- Wortmarkierung im Transkript
- Tuu-Hinweise ein- oder ausschalten und bereits geschlossene Hinweise zurücksetzen
- Preisübersicht und Kaufmöglichkeiten
- Standortberechtigungen über die Geräteeinstellungen
- Einwilligung für persönliche KI-Touren
- optionale Diagnose- beziehungsweise Absturzberichte
- Werbedatenschutzeinstellungen
- Datenexport, Abmeldung und Kontolöschung
- Impressum, Datenschutz, Nutzungsbedingungen sowie Quellen und Lizenzen

Ein Bewegungssimulator gehört zu Entwicklungs- beziehungsweise Demoabläufen und ist kein versprochener Reisemodus der veröffentlichten App.

### Welche Daten wofür verwendet werden

| Daten                                              | Verwendung                                                                                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Kontodaten                                         | Anmeldung, Käufe, Berechtigungen und persönliche Inhalte.                                                                              |
| Standort                                           | Lokale Tourbegleitung; für bestimmte Wege- oder Näheprüfungen werden erforderliche Koordinaten vorübergehend an den Server übertragen. |
| Gebietskachel                                      | Auswahl und Erfassung der verfügbaren Umgebung.                                                                                        |
| Interessen, Sprache, gewählte Orte und Reihenfolge | Personalisierung neuer Empfehlungen und Erzählungen bei entsprechender KI-Einwilligung.                                                |
| Erzähltext und gewählte Stimme                     | Erzeugung von Audiodateien beim konfigurierten Sprachdienst.                                                                           |
| Persönliche Aufnahmen                              | Geschützte Speicherung und Wiederverwendung innerhalb des berechtigten Kontos beziehungsweise der Gruppe.                              |
| Tourverlauf und GPS-Spur                           | Lokaler Rückblick, Karte, Statistik und Stadt-Badges.                                                                                  |
| Ausgewählte Aktivitätsfotos                        | Vorübergehende Ergänzung der selbst geteilten Rückblickkarte.                                                                          |
| Nutzungs- und Partnerereignisse                    | Betriebs-, Kosten- und aggregierte Angebotsstatistiken.                                                                                |

Die KI-Einwilligung erläutert Google Gemini für Text und Google beziehungsweise OpenAI für Sprachausgabe. Konto-, Telefon-, E-Mail-, Geräte- und Sitzungskennungen sowie die genaue GPS-Position sollen nicht an diese KI-Dienste übermittelt werden. Die übermittelte Reihenfolge von Orten kann dennoch Rückschlüsse auf einen Weg erlauben. Die Anbieter können Daten außerhalb der EU verarbeiten.

Die Einwilligungsabfrage pausiert aktive kostenpflichtige Tourzeit. Ablehnen lässt die Nutzung im Textmodus zu; Widerrufen ist in den Einstellungen möglich und löscht vorhandene Aufnahmen nicht automatisch. Neue persönliche KI-Anfragen dürfen ohne die gültige Einwilligung nicht weiterlaufen.

Diagnoseberichte sind standardmäßig ausgeschaltet. Werbeeinwilligung, KI-Einwilligung, Standortfreigabe und Fotozugriff sind getrennte Entscheidungen.

### Export und Kontolöschung

**Daten exportieren** ruft die serverseitig zugeordneten Kontodaten ab und bietet sie als JSON über die Teilenfunktion an. Der lokale Tourverlauf ist davon zu unterscheiden.

Die Kontolöschung ist über die Einstellungen und bereits vor Abschluss des Onboardings erreichbar. Bei einem Apple-Konto wird zuvor die Apple-Verknüpfung widerrufen; dazu kann eine erneute Apple-Bestätigung nötig sein. Anschließend werden zugeordnete Serverdaten, persönliche Aufnahmen und eigene Meldungen entfernt. Gruppen des Gastgebers werden beendet beziehungsweise entfernt. Anonyme Betriebs- und Einlöseaggregate können bestehen bleiben.

Nach erfolgreicher Serverlöschung bereinigt die App lokale Tourzustände, Downloads und Verlauf und setzt persönliche Einstellungen zurück. Scheitert diese lokale Bereinigung, kann sie wiederholt werden. Kontolöschung ist keine automatische Kündigung eines App-Store-Abos; laufende Store-Abos müssen im jeweiligen Store verwaltet werden.

### Fehler und unerwünschte Inhalte melden

Fehler in einer Erzählung können zur Prüfung gemeldet werden. Für Werbung und Partnerangebote existiert zusätzlich eine Meldung mit Grund und Beschreibung, etwa für irreführende oder unangemessene Inhalte. Bei einem Partnerangebot kann zugleich der betreffende Partner für das eigene Konto blockiert werden. Ein Supportkontakt ist aus dem Meldebereich erreichbar.

## Partnerangebote und Unternehmen

### Angebote für Appnutzer

Ein Partnerort kann als solcher gekennzeichnet erscheinen und ein freigegebenes Angebot anzeigen. Partnerinformationen werden getrennt von redaktionellen Ortsinformationen behandelt; ein Partnerstatus ist keine Garantie für eine Aufnahme in jede Tour.

Zur Einlösung erzeugt die App in der Nähe des Partners einen zeitlich begrenzten QR-Code. Der Partner prüft ihn mit dem Scanner im Webportal; auch manuelle Codeeingabe ist möglich. Der Server kontrolliert unter anderem Nähe, Gültigkeit, Einmaligkeit und Angebotslimits. Die Standardwerte sind **150 Meter** Entfernung und **zehn Minuten** Codegültigkeit; beide sind konfigurierbar. Pro Konto und Angebot ist höchstens eine Einlösung je UTC-Tag vorgesehen. Eine erfolgreiche Einlösung wird bestätigt und statistisch erfasst.

Neue oder bearbeitete Angebote benötigen im aktuellen Code eine Prüfung. Ältere Angebote ohne ausdrückliche Freigabe gelten ebenfalls nicht automatisch als genehmigt. Liveangebote setzen einen tatsächlich verfügbaren Prüf- und Verwaltungsprozess voraus.

### Bewerbung in der App

Über den Unternehmenseinstieg in den Einstellungen können Betriebe Interesse an einer Zusammenarbeit anmelden. Der Ablauf erfasst Angaben zum Betrieb, zur Kategorie und zum Standort sowie Kontakt- und Budgetangaben. Eine Bewerbung ist noch keine sofortige Veröffentlichung als aktiver Partner.

### Partnerportal im Web

Der Webbereich enthält eigene Ansichten für:

- Registrierung und Anmeldung
- Firmenprofil und Zuordnung zu einem Ort
- Angebote und deren Prüfstatus
- Pakete beziehungsweise Abrechnung und Zahlungsverwaltung
- QR-Scanner
- Statistiken zu Sichtbarkeit, Besuchen und Einlösungen
- Kontodaten, Export und Löschung

Im Partnerprofil können Name, Kategorie, Adresse, Land, Öffnungszeiten, Beschreibung und Website gepflegt werden. Angebote besitzen Titel, Beschreibung, Bedingungen, Gültigkeit und gegebenenfalls Einlöselimits. Eine Partnerschaft kann die Sichtbarkeit nur innerhalb begrenzter Regeln beeinflussen; ungeeignete Umwege oder ein beliebiger Anteil bezahlter Stationen sind nicht das Ziel der Routenwahl.

Das Projekt enthält sowohl ein Stripe-basiertes Paket- und Abonnementmodell als auch einen später ergänzten Ansatz zur Abrechnung nach vermittelten Besuchen und Einlösungen. Die für Unternehmen verbindliche Abrechnung muss mit dem tatsächlich aktivierten Portal und Vertrag übereinstimmen. Die Traktionsvorgaben und noch offenen Umsetzungsschritte stehen in [PARTNER_PRICING.md](PARTNER_PRICING.md); eine vollständige automatische Abrechnung dieses neueren Modells wird hier nicht zugesagt.

## Verwaltung und Qualitätssicherung

Der separate Adminbereich ist für entsprechend berechtigte Betreiber vorgesehen. Er ist kein frei erreichbarer Teil der mobilen App.

| Bereich         | Verwaltungsfunktionen                                                                                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gebiete         | Datenstatus, vorhandene Inhalte und Kosten einsehen; Erfassung auslösen oder wiederholen; Gebiete sperren.                                                                              |
| Orte und Touren | Inhalte prüfen, ausblenden, gewichten oder korrigieren; Touren bearbeiten, sperren oder hervorheben.                                                                                    |
| Erzählungen     | Inhalte und Quellen prüfen, Aufnahmen sperren oder zur erneuten Erstellung vormerken.                                                                                                   |
| Qualität        | Fehlermeldungen und Meldungen zu Werbung beziehungsweise Angeboten bearbeiten.                                                                                                          |
| Partner         | Partnerprofile prüfen, freigeben oder sperren; Angebote moderieren und Konfiguration verwalten. Die separat gespeicherten Partnerbewerbungen besitzen noch keine eigene Prüfoberfläche. |
| KI und Kosten   | Modelle, Promptversionen, Limits, Budgets und Not-Aus verwalten.                                                                                                                        |

Administrative Änderungen werden serverseitig autorisiert und protokolliert. Der aktuelle statische Beta-Host für Rechts- und Linkseiten ist **nicht** automatisch eine Bereitstellung dieser Adminanwendung oder des Partnerportals.

## Technischer Aufbau und Datenquellen

| Projektteil       | Aufgabe                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| `apps/mobile`     | Expo- und React-Native-App mit Tourmodi, Player, Karte, Konto, Offlinebibliothek und Profil.        |
| `apps/web`        | Next.js-Anwendung mit Partnerportal, Verwaltung und öffentlichen Link- und Rechtsseiten.            |
| `functions`       | Firebase-Backend für Gebietsdaten, Wege, Texte, Audio, Käufe, Gruppen, Partner und Kontoverwaltung. |
| `packages/shared` | Gemeinsame Datenmodelle und Regeln für Routing, Touren, Minuten, Berechtigungen und Inhalte.        |
| `packages/ui`     | Gemeinsame Gestaltungsvorgaben, Farben, Typografie und Kartenstil.                                  |
| `assets/brand`    | Logo, Bildmarke und Appgrafiken.                                                                    |

Ortsdaten können aus **OpenStreetMap, Wikidata und Wikipedia** stammen. Frei lizenzierte Bilder werden mit Quellen- und Lizenzangaben verwendet, insbesondere aus Wikimedia Commons. Der aktuelle Betadatenbestand ist eine begrenzte Auswahl; die generelle Datenpipeline allein stellt noch keine weltweite Verfügbarkeit her.

Für persönliche Texte dient ein konfigurierbarer Sprachmodellanbieter, insbesondere Gemini. Sprachsynthese kann über Gemini oder OpenAI laufen. Modelle und Stimmen sind konfigurierbar; die App legt keine dauerhaft garantierte Modellversion fest. Google-Places-Livedaten oder aktuelle Öffnungszeiten gehören nicht automatisch zu diesem Funktionsumfang.

Native Karten nutzen MapLibre mit konfigurierbarer Kartenquelle. Fuß- und Radwege werden im Livebetrieb über einen geschützten OpenRouteService-Zugang ermittelt. Die Backenddienste prüfen Berechtigungen, begrenzen Anfragen und KI-Ausgaben und können bei ausgeschöpftem Budget neue Generierung ablehnen.

Die technische Pipeline für neue Gebiete umfasst Gebietserfassung, Zusammenführen doppelter Orte, Quellenanreicherung, Bewertung und Tourerstellung. Sie kennt Lade-, Fehler- und inhaltsschwache Zustände. In der begrenzten Beta wird diese Pipeline außerhalb der freigegebenen Kacheln nicht automatisch weltweit ausgeführt.

## Grenzen und typische Fragen

| Frage                                                           | Antwort                                                                                                                                                                                                    |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Funktioniert tuur heute überall?                                | Die Architektur ist auf weitere Regionen ausgelegt. Die dokumentierte Live-Beta beschränkt sich auf Berlin-Mitte. Demoorte sind keine Aussage über Liveabdeckung.                                          |
| Muss ich bezahlen, um eine Tour zu machen?                      | Für Online-Texttouren und Navigation nach aktuellem Produktstand nicht. Persönliches Audio und neue Downloads benötigen passenden bezahlten Zugang.                                                        |
| Muss ich meine Telefonnummer angeben?                           | Für die normale Nutzung im aktuellen Code nicht. Einzelne Gratis- und Reward-Freischaltungen können eine Verifizierung verlangen.                                                                          |
| Ist Premium unbegrenzt?                                         | Nein. Beide Abolaufzeiten enthalten 500 aktive Audio-Tourminuten je UTC-Kalendermonat.                                                                                                                     |
| Verbraucht nur das Sprechen Minuten?                            | Nein. Gezählt wird aktive Audio-Tourzeit einschließlich der Wege; Pause und Textmodus zählen nicht.                                                                                                        |
| Kann ich die App ohne KI-Einwilligung verwenden?                | Ja, mit kostenlosen Quellentexten und Wegen sowie vorhandenen Aufnahmen. Neue persönliche KI-Inhalte erfordern Zustimmung.                                                                                 |
| Funktioniert alles im Flugmodus?                                | Vollständig vorbereitete feste Touren können lokal wiedergegeben werden. Dynamische Entdeckung, Gruppenzugänge und neue Inhalte benötigen Netz. Die Hintergrundkarte hängt vom vorhandenen Kartenpaket ab. |
| Bleibt ein fertiger Download nach dem Aboende erhalten?         | Ja, bis er lokal gelöscht wird. Neue Downloads und Erweiterungen prüfen erneut den Zugang.                                                                                                                 |
| Sind Gruppen ein Sprachchat?                                    | Nein. Die Geräte verwenden dieselbe Führung; Sprachchat und eine Livekarte aller Personen sind nicht Teil der beschriebenen Funktion.                                                                      |
| Gibt es Auto- oder ÖPNV-Navigation?                             | Die Erzählung kann schnellere Bewegung berücksichtigen. Eigene Auto- oder ÖPNV-Routen, Fahrpläne und Abbiegeansagen dafür sind nicht implementiert.                                                        |
| Werden mein Verlauf und meine Fotos automatisch synchronisiert? | Nein. Verlauf und Aktivitätsfotoauswahl bleiben lokal; geteilt wird nur durch eine ausdrückliche Nutzeraktion.                                                                                             |
| Sind alle hier beschriebenen Funktionen schon in TestFlight?    | Nein. Dieses Dokument beschreibt den Projektstand. Veröffentlichten App- und Backendstand sowie offene Gerätetests beschreibt die Release-Datei.                                                           |

Native Käufe, reale Werbung, Hintergrundaudio, GPS-Navigation, Gruppennutzung auf zwei Geräten und Offlinekarten müssen mit dem passenden Build und den aktivierten Diensten geprüft werden. Expo Go, Browserdarstellung und automatisierte Logiktests ersetzen diese Geräteprüfung nicht.

## Weiterführende Dokumentation und Code

### Dokumente

| Datei                                     | Inhalt                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [RELEASE.md](RELEASE.md)                  | Aktueller Veröffentlichungsstand, TestFlight, Beta-Backend und offene Prüfungen.                                                      |
| [DECISIONS.md](DECISIONS.md)              | Produktentscheidungen und Änderungen gegenüber dem ursprünglichen Konzept.                                                            |
| [PRODUCT_SPEC.md](PRODUCT_SPEC.md)        | Ursprüngliche Produktspezifikation; einzelne Regeln wurden inzwischen ersetzt.                                                        |
| [PROGRESS.md](PROGRESS.md)                | Historischer Implementierungsfortschritt und frühere Prüfstände.                                                                      |
| [SETUP.md](SETUP.md)                      | Einrichtung der Entwicklungsumgebung und externer Dienste.                                                                            |
| [TESTING_IOS.md](TESTING_IOS.md)          | iOS-Test- und Vorschauabläufe.                                                                                                        |
| [DYNAMIC_ISLAND.md](DYNAMIC_ISLAND.md)    | Native Live-Activity-Integration und Gerätetests; ältere Distanz- und Wiederherstellungsbeschreibungen mit aktuellem Code abgleichen. |
| [PARTNER_PRICING.md](PARTNER_PRICING.md)  | Ansatz zur Partnerabrechnung und offene Schritte.                                                                                     |
| [UNIT_ECONOMICS.md](UNIT_ECONOMICS.md)    | Kosten- und Wirtschaftlichkeitsannahmen.                                                                                              |
| [Brand-README](../assets/brand/README.md) | Logo, Bildmarke, Farben und erzeugte Grafikdateien.                                                                                   |

### Zentrale Implementierungen

| Thema                                 | Einstieg im Code                                                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Bildschirme und Navigation            | [Mobile-Routen](../apps/mobile/app)                                                                                          |
| Anmeldung und optionale Telefonnummer | [Kontozugang](../apps/mobile/src/auth/policy.ts), [Anmeldung](../apps/mobile/app/sign-in.tsx)                                |
| Tourlaufzeit und Wiederaufnahme       | [Guide-Session](../apps/mobile/src/guide/session.ts), [Guide-Runtime](../apps/mobile/src/guide/runtime.ts)                   |
| Quellenbasierte Textkarten            | [POI-Text-Hook](../apps/mobile/src/hooks/usePoiText.ts), [Backend für Ortsinformationen](../functions/src/poi)               |
| Stimmen                               | [Stimmenkonfiguration](../packages/shared/src/narration/voices.ts)                                                           |
| Audiozugang und Minuten               | [Berechtigungen](../packages/shared/src/billing/entitlements.ts), [Zeitbudget](../packages/shared/src/billing/timeBudget.ts) |
| Produkte und Demopreise               | [Demo-Kaufanbieter](../apps/mobile/src/billing/demoBilling.ts)                                                               |
| Downloads                             | [Downloadmanager](../apps/mobile/src/offline/manager.ts), [Serverprüfung](../functions/src/billing/downloads.ts)             |
| Gruppen                               | [Gruppenregeln](../packages/shared/src/billing/groups.ts), [Gruppendienst](../functions/src/groups/service.ts)               |
| Verlauf und Rückblick                 | [Lokaler Verlauf](../apps/mobile/src/state/history.ts), [Rückblick](../apps/mobile/app/summary)                              |
| KI-Einwilligung                       | [Einwilligungstexte](../packages/shared/src/privacy/aiConsent.ts), [Clientablauf](../apps/mobile/src/privacy/aiConsent.ts)   |
| Kontodaten und Löschung               | [Kontodienst](../functions/src/account/service.ts), [Lokale Bereinigung](../apps/mobile/src/auth/delete-local-data.ts)       |
| Angebote und Meldungen                | [Angebotsprüfung](../functions/src/safety/offers.ts), [Meldungen](../functions/src/safety/reports.ts)                        |
| Partner und Verwaltung                | [Partnerseiten](../apps/web/app/partner), [Adminseiten](../apps/web/app/admin)                                               |

Bei Änderungen an Tourmodi, Zugang, Minuten, Downloads, Gruppen oder Datenschutz sollte diese Übersicht mit dem jeweiligen Produkt- und Codezustand aktualisiert werden. Für eine installierte Version zählt ihr eigener Buildstand.
