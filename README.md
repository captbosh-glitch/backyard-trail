# Backyard & Trail

A proactive wilderness awareness guide. Search a trail, park, town or ZIP code (or use your location) to see the
dangerous plants, wildlife and fungi documented within 10 miles, with what to look for, how to stay clear,
what to do if someone is exposed, and advice for hiking with a dog.

It's built for awareness, not identification: the guide never says anything is safe to touch or eat.

## How it works

- **Places:** OpenStreetMap Nominatim (search, your location) and Zippopotam.us (ZIP codes).
- **Sightings:** iNaturalist research-grade observations within 10 miles, for the ~40 species in the guide.
  Two hazards iNaturalist can't track (valley fever, Africanized bees) are included by state.
- **Map:** Leaflet with OpenStreetMap tiles.
- **Offline packs:** "Save for offline" keeps a place's guide in the browser, and the service worker (`sw.js`)
  keeps the app, illustrations and that place's photos, so the guide works without signal.
- **Camera:** a live viewfinder with a 6-foot guide ring where the browser allows it; otherwise the phone's camera
  app. Photos never leave the phone.

## No account needed

There are no accounts, on purpose. Saved places, offline packs and preferences (dog mode, a sting allergy) stay
on the device. To move saved places to another device, export them as a file from the Saved screen and import it
there, or copy a link to any place. The "No account needed" screen explains exactly what's sent where.

No build step: `index.html`, `app.css`, `data.js` (guide entries, icons, credits) and `app.js` (screens and logic).
To run it locally: `python3 -m http.server` in this folder, then open http://localhost:8000.

## Content

Harm levels and advice are educational guidance written for this prototype, not medical advice, and should be
reviewed by experts (herpetologists, mycologists, poison control) before a wide release.

## Photo credits (Wikimedia Commons)

- copperhead: Centers for Disease Control and Prevention, Public domain (https://commons.wikimedia.org/wiki/File:Agkistrodon_contortrix_contortrix_CDC-a.png)
- timber: Peter Paplanus, CC BY 2.0 (https://commons.wikimedia.org/wiki/File:Timber_Rattlesnake_(Crotalus_horridus)_-_Flickr_-_2ndPeter.jpg)
- destroying: Dan Molter (shroomydan), CC BY-SA 3.0 (https://commons.wikimedia.org/wiki/File:Amanita_bisporigera_17932.jpg)
- jackolantern: KeithMiklas, CC BY-SA 4.0 (https://commons.wikimedia.org/wiki/File:Jack_o%27_Lantern_Mushroom_Fungus.png)
- poisonivy: Bob Peterson, CC BY-SA 2.0 (https://commons.wikimedia.org/wiki/File:Eastern_Poison_Ivy_(Toxicodendron_radicans)_(12694696594).jpg)
- hemlock: Williammehlhorn, Public domain (https://commons.wikimedia.org/wiki/File:Cicuta_maculata.jpg)
- pokeweed: John B., CC BY 2.0 (https://commons.wikimedia.org/wiki/File:Phytolacca_americana_berries_Mccrea_Mills.jpg)
- bear: Charles J. Sharp, CC BY-SA 4.0 (https://commons.wikimedia.org/wiki/File:Vancouver_Island_black_bear_(Ursus_americanus_vancouveri)_Tofino_4.jpg)
- yellowjacket: Fir0002, GFDL 1.2 (https://commons.wikimedia.org/wiki/File:European_wasp_white_bg.jpg)
- tick: Scott Bauer, USDA, Public domain (https://commons.wikimedia.org/wiki/File:Adult_deer_tick.jpg)
- toad: Cephas, CC BY-SA 3.0 (https://commons.wikimedia.org/wiki/File:Bufo_americanus_PJC1.jpg)
- elk: Membeth, CC0 (https://commons.wikimedia.org/wiki/File:Jasper.Wapiti-Hirsch.P1033401.jpg)
- hog: NASA, Public domain (https://commons.wikimedia.org/wiki/File:Wild_Pig_KSC02pd0873.jpg)
- diamondback: Holger Krisp, CC BY 3.0 (https://commons.wikimedia.org/wiki/File:(Westliche_Diamantklapperschlange)_Crotalus_atrox.jpg)
- mojave: Lvthn13, Public domain (https://commons.wikimedia.org/wiki/File:Crotalus_scutulatus_02.JPG)
- scorpion: Andrew Meeds, CC BY 4.0 (https://commons.wikimedia.org/wiki/File:Centruroides_sculpturatus_191624836.jpg)
- gila: Blueag9, CC BY-SA 3.0 (https://commons.wikimedia.org/wiki/File:Gila_monster2.JPG)
- sonorantoad: Wildfeuer, CC BY-SA 3.0 (https://commons.wikimedia.org/wiki/File:2009-03-13Bufo_alvarius067.jpg)
- bees: Jonathan Wilkins, CC BY-SA 3.0 (https://commons.wikimedia.org/wiki/File:Swarm_of_Africanized_honey_bees.jpg)
- cholla: Matthew Field, CC BY 3.0 (https://commons.wikimedia.org/wiki/File:Cylindropuntia_bigelovii.jpg)
- datura: Dlarsen, Public domain (https://commons.wikimedia.org/wiki/File:Datura_wrightii_flower2.jpg)
- valleyfever: John Jurik, Public domain (https://commons.wikimedia.org/wiki/File:Haboob,_Ahwatukee.jpg)
- javelina: Carlos Delgado, CC BY-SA 3.0 (https://commons.wikimedia.org/wiki/File:Pecari_tajacu_-_02.jpg)
- cougar: National Park Service, Public domain (https://commons.wikimedia.org/wiki/File:Mountain_Lion_in_Glacier_National_Park.jpg)
- coyote: Yathin S Krishnappa, CC BY-SA 3.0 (https://commons.wikimedia.org/wiki/File:2009-Coyote-Yosemite.jpg)
- blackwidow: Wikimedia Commons contributor, CC BY 2.0 (https://commons.wikimedia.org/wiki/File:Latrodectus_mactans_eating.JPG)
- moose: Paxson Woelber, CC BY-SA 4.0 (https://commons.wikimedia.org/wiki/File:Alaska_moose.jpg)
- wolf: Mas3cf, CC BY-SA 4.0 (https://commons.wikimedia.org/wiki/File:Eurasian_wolf_2.jpg)
- grizzly: Jean Beaufort, CC0 (https://commons.wikimedia.org/wiki/File:GrizzlyBearJeanBeaufort.jpg)
- alligator: Postdlf, CC BY-SA 3.0 (https://commons.wikimedia.org/wiki/File:American_Alligator.jpg)
- cottonmouth: CDC / Edward J. Wozniak, Public domain (https://commons.wikimedia.org/wiki/File:Agkistrodon_piscivorus_piscivorus_CDC.png)
- easterndiamond: Caudatejake, CC BY-SA 4.0 (https://commons.wikimedia.org/wiki/File:Adult_Crotalus_adamanteus.jpg)
- coralsnake: Norman.benton, CC BY-SA 3.0 (https://commons.wikimedia.org/wiki/File:Coral_009.jpg)
- canetoad: Benjamint444, GFDL 1.2 (https://commons.wikimedia.org/wiki/File:Canetoadmale.jpg)
- manchineel: Hans Hillewaert, CC BY-SA 3.0 (https://commons.wikimedia.org/wiki/File:Hippomane_mancinella_(fruit).jpg)
- poisonwood: Mason Brock, Public domain (https://commons.wikimedia.org/wiki/File:Metopium_toxiferum.jpg)
- deathcamas: Craig Martin, CC0 (https://commons.wikimedia.org/wiki/File:Toxicoscordion_venenosum_-_Craig_Martin_01.jpg)
- westernhemlock: Wikimedia Commons contributor, Public domain (https://commons.wikimedia.org/wiki/File:Cicuta_douglasii.jpg)
- panther: Rodney Cammauf, National Park Service, Public domain (https://commons.wikimedia.org/wiki/File:Everglades_National_Park_Florida_Panther.jpg)
- woodtick: James Gathany, CDC, Public domain (https://commons.wikimedia.org/wiki/File:Dermacentor_andersoni_PHIL_10865.tif)

Illustrations in `art/`: sourced by the project owner; check each one's license before public release.
