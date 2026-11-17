// Openly licensed sample photographs, separate from the Supabase marketplace.
export type WildlifeCategory = 'Big cats' | 'Large mammals' | 'Birds';

export interface WildlifePhoto {
  id: string;
  title: string;
  species: string;
  location: string;
  category: WildlifeCategory;
  alt: string;
  layout: 'portrait' | 'panorama' | 'landscape' | 'wide';
  position: string;
  src: string;
  width: number;
  height: number;
  author: string;
  sourceUrl: string;
  sourceTitle: string;
  license: string;
  licenseUrl: string;
}

export const wildlifePhotos: WildlifePhoto[] = [
  {
    "id": "lion",
    "title": "The Serengeti king",
    "species": "Lion",
    "location": "Serengeti, Tanzania",
    "category": "Big cats",
    "alt": "A male lion with a golden mane sitting in the Serengeti grass.",
    "layout": "portrait",
    "position": "50% 44%",
    "src": "/wildlife/lion.jpg",
    "width": 1000,
    "height": 1250,
    "author": "Giles Laurent",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:011_The_lion_king_Tryggve_in_the_Serengeti_National_Park_Photo_by_Giles_Laurent.jpg",
    "sourceTitle": "011 The lion king Tryggve in the Serengeti National Park Photo by Giles Laurent.jpg",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0"
  },
  {
    "id": "elephant",
    "title": "Crossing the Luangwa",
    "species": "African elephants",
    "location": "South Luangwa, Zambia",
    "category": "Large mammals",
    "alt": "A herd of elephants and their calves crossing the Luangwa River.",
    "layout": "panorama",
    "position": "50% 70%",
    "src": "/wildlife/elephant.jpg",
    "width": 1000,
    "height": 500,
    "author": "Geoff Gallice",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Loxodonta_africana_South_Luangwa_National_Park_(1).jpg",
    "sourceTitle": "Loxodonta africana South Luangwa National Park (1).jpg",
    "license": "CC BY 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/2.0"
  },
  {
    "id": "giraffe",
    "title": "Above the canopy",
    "species": "Giraffe",
    "location": "Lake Manyara, Tanzania",
    "category": "Large mammals",
    "alt": "A giraffe framed by green leaves and branches in Lake Manyara.",
    "layout": "portrait",
    "position": "50% 40%",
    "src": "/wildlife/giraffe.jpg",
    "width": 1000,
    "height": 1499,
    "author": "Giles Laurent",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:006_Giraffe_portrait_in_the_Lake_Manyara_National_Park_Photo_by_Giles_Laurent.jpg",
    "sourceTitle": "006 Giraffe portrait in the Lake Manyara National Park Photo by Giles Laurent.jpg",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0"
  },
  {
    "id": "cheetah",
    "title": "The last light",
    "species": "Cheetah",
    "location": "Okavango, Botswana",
    "category": "Big cats",
    "alt": "A cheetah silhouetted against a vivid orange sunset in the Okavango.",
    "layout": "landscape",
    "position": "50% 55%",
    "src": "/wildlife/cheetah.jpg",
    "width": 1000,
    "height": 666,
    "author": "Arturo de Frias Marques",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Cheetah_at_Sunset.jpg",
    "sourceTitle": "Cheetah at Sunset.jpg",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0"
  },
  {
    "id": "leopard",
    "title": "Quiet confidence",
    "species": "Leopard",
    "location": "Kruger, South Africa",
    "category": "Big cats",
    "alt": "A leopard walking through green grass in Kruger National Park.",
    "layout": "landscape",
    "position": "50% 50%",
    "src": "/wildlife/leopard.jpg",
    "width": 1000,
    "height": 667,
    "author": "Charles J. Sharp",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Leopard_(Panthera_pardus_pardus)_Kruger.jpg",
    "sourceTitle": "Leopard (Panthera pardus pardus) Kruger.jpg",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0"
  },
  {
    "id": "zebra",
    "title": "Stripes of Etosha",
    "species": "Mountain zebra",
    "location": "Etosha, Namibia",
    "category": "Large mammals",
    "alt": "A Hartmann's mountain zebra standing on the dry ground of Etosha.",
    "layout": "wide",
    "position": "50% 50%",
    "src": "/wildlife/zebra.jpg",
    "width": 1000,
    "height": 667,
    "author": "Yathin S Krishnappa",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Equus_zebra_hartmannae_-_Etosha_2015.jpg",
    "sourceTitle": "Equus zebra hartmannae - Etosha 2015.jpg",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0"
  },
  {
    "id": "roller",
    "title": "A flash of colour",
    "species": "Lilac-breasted roller",
    "location": "Kruger, South Africa",
    "category": "Birds",
    "alt": "A colourful lilac-breasted roller perched on a branch with an insect in its beak.",
    "layout": "wide",
    "position": "50% 42%",
    "src": "/wildlife/roller.jpg",
    "width": 1000,
    "height": 1221,
    "author": "Diego Delso",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Carraca_lila_(Coracias_caudata),_parque_nacional_Kruger,_Sud%C3%A1frica,_2018-07-26,_DD_17.jpg",
    "sourceTitle": "Carraca lila (Coracias caudata), parque nacional Kruger, Sudáfrica, 2018-07-26, DD 17.jpg",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0"
  },
  {
    "id": "rhino",
    "title": "On ancient ground",
    "species": "Black rhinoceros",
    "location": "Etosha, Namibia",
    "category": "Large mammals",
    "alt": "A black rhinoceros grazing among the shrubs of Etosha National Park.",
    "layout": "wide",
    "position": "50% 48%",
    "src": "/wildlife/rhino.jpg",
    "width": 1000,
    "height": 667,
    "author": "Charles J. Sharp",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:South-western_black_rhinoceros_(Diceros_bicornis_occidentalis)_female.jpg",
    "sourceTitle": "South-western black rhinoceros (Diceros bicornis occidentalis) female.jpg",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0"
  }
];

