import type { Coordinates, GenerateRequest, Place, WanderRoute } from "./types";
import { rankRoutes, scorePlaces } from "./geo/scoring";
import { EDINBURGH_POINTS, EDINBURGH_HUBS } from "./geo/edinburgh-points";
import { distanceMeters } from "./geo/coordinates";

export { EDINBURGH_POINTS, EDINBURGH_HUBS };

// Canonical default demo start (The Meadows / Southside)
export const DEMO_START: Coordinates = { lat: 55.9442, lng: -3.19055 };
export const DEMO_DESTINATION: Coordinates = { lat: 55.94695, lng: -3.1891 };

type Fixture = {
  hubId: string;
  name: string;
  description: string;
  stops: (keyof typeof EDINBURGH_POINTS)[];
  path: [number, number][];
  highlightTag?: string;
};

const meadowsStart: [number, number] = [DEMO_START.lng, DEMO_START.lat];
const deanStart: [number, number] = [-3.2165, 55.9515];
const caltonStart: [number, number] = [-3.1835, 55.9538];
const stockbridgeStart: [number, number] = [-3.2045, 55.9575];
const leithStart: [number, number] = [-3.1695, 55.9752];
const holyroodStart: [number, number] = [-3.1748, 55.9518];

const fixtures: Fixture[] = [
  // --- Southside & Meadows (matches canonical DEMO_START) ---
  {
    hubId: "meadows",
    name: "A little breathing room",
    description: "A short sample wander under the Meadows' trees.",
    stops: ["middle"],
    path: [meadowsStart, [-3.1905, 55.9436], [-3.19045, 55.9429], [-3.19105, 55.94315], [-3.19135, 55.94355], [-3.1912, 55.94405], meadowsStart],
    highlightTag: "Under the trees",
  },
  {
    hubId: "meadows",
    name: "The quiet square",
    description: "A sample stroll from leafy paths to Georgian gardens.",
    stops: ["george"],
    path: [meadowsStart, [-3.1905, 55.9437], [-3.1894, 55.94365], [-3.1883, 55.94365], [-3.1873, 55.94365], [-3.1873, 55.94405], [-3.1885, 55.94415], meadowsStart],
    highlightTag: "Georgian greenery",
  },
  {
    hubId: "meadows",
    name: "Bristo's grand entrance",
    description: "A sample city walk between two handsome university landmarks.",
    stops: ["mcewan", "teviot"],
    path: [meadowsStart, [-3.1904, 55.94455], [-3.1894, 55.9446], [-3.1882, 55.94465], [-3.18755, 55.9447], [-3.1876, 55.94415], [-3.189, 55.94415], [-3.189, 55.94395], [-3.1903, 55.94395], meadowsStart],
    highlightTag: "Sandstone heritage",
  },
  {
    hubId: "meadows",
    name: "A sandstone side quest",
    description: "A tiny sample adventure around a beloved university building.",
    stops: ["teviot"],
    path: [meadowsStart, [-3.1905, 55.9437], [-3.189, 55.9437], [-3.189, 55.94395], [-3.189, 55.9442], meadowsStart],
    highlightTag: "Gothic gables",
  },
  {
    hubId: "meadows",
    name: "Lawns and little discoveries",
    description: "An easy sample loop through the Meadows and a university square.",
    stops: ["middle", "meadows", "george"],
    path: [meadowsStart, [-3.19045, 55.9429], [-3.1921, 55.94245], [-3.19055, 55.9419], [-3.18835, 55.94215], [-3.1873, 55.94365], [-3.18735, 55.9441], [-3.189, 55.94415], meadowsStart],
    highlightTag: "A little green space",
  },
  {
    hubId: "meadows",
    name: "Edinburgh in miniature",
    description: "A sample wander between a grand hall, museum and beloved little dog.",
    stops: ["mcewan", "museum", "greyfriars"],
    path: [meadowsStart, [-3.1904, 55.94455], [-3.18755, 55.9447], [-3.1877, 55.94525], [-3.18785, 55.94695], [-3.1891, 55.94695], [-3.1921, 55.9469], [-3.1916, 55.9455], [-3.1914, 55.9446], meadowsStart],
    highlightTag: "Old Town stories",
  },
  {
    hubId: "meadows",
    name: "Castle steps & cobbled wynds",
    description: "Climb past Greyfriars into the Vennel for iconic framed castle vistas.",
    stops: ["greyfriars", "vennel", "grassmarket"],
    path: [meadowsStart, [-3.1914, 55.9446], [-3.1921, 55.9469], [-3.1945, 55.9468], [-3.1972, 55.9468], [-3.1958, 55.9472], [-3.1932, 55.9465], meadowsStart],
    highlightTag: "Iconic Castle view",
  },
  {
    hubId: "meadows",
    name: "Secret gardens of the Royal Mile",
    description: "A longer journey down the High Street into hidden 17th-century courtyard gardens.",
    stops: ["museum", "stGiles", "dunbarsClose"],
    path: [meadowsStart, [-3.1891, 55.94695], [-3.1908, 55.9495], [-3.1855, 55.9505], [-3.1818, 55.9517], [-3.1835, 55.9485], [-3.1873, 55.9455], meadowsStart],
    highlightTag: "Hidden tranquil garden",
  },
  {
    hubId: "meadows",
    name: "The Grand Edinburgh Heritage Circuit",
    description: "From open lawns through medieval wynds, castle battlements, and panoramic vistas.",
    stops: ["victoriaStreet", "castleEsplanade", "dugaldStewart", "scottishParliament"],
    path: [meadowsStart, [-3.1932, 55.9479], [-3.1985, 55.9487], [-3.1945, 55.9515], [-3.1835, 55.9538], [-3.1748, 55.9518], [-3.1815, 55.9475], meadowsStart],
    highlightTag: "Edinburgh panoramas",
  },

  // --- Dean Village & Water of Leith ---
  {
    hubId: "dean-village",
    name: "Fairytale mill cottages",
    description: "A tranquil stroll along the rushing river weir and historic mill houses.",
    stops: ["wellCourt", "deanBridge"],
    path: [deanStart, [-3.2173, 55.9522], [-3.215, 55.9525], [-3.2135, 55.9529], [-3.215, 55.952], deanStart],
    highlightTag: "Riverside tranquility",
  },
  {
    hubId: "dean-village",
    name: "Water of Leith & Classical Temple",
    description: "Follow the shaded river path past Telford's monumental bridge to St Bernard's Well.",
    stops: ["wellCourt", "deanBridge", "stBernardsWell"],
    path: [deanStart, [-3.2173, 55.9522], [-3.2135, 55.9529], [-3.212, 55.9545], [-3.2105, 55.9556], [-3.212, 55.9535], deanStart],
    highlightTag: "River gorge & temple",
  },
  {
    hubId: "dean-village",
    name: "Dean Village to Circus Lane mews",
    description: "Connect the fairytale river gorge with the most photogenic cobbled mews in Edinburgh.",
    stops: ["deanBridge", "stBernardsWell", "circusLane"],
    path: [deanStart, [-3.2135, 55.9529], [-3.2105, 55.9556], [-3.2078, 55.9565], [-3.2045, 55.9575], [-3.207, 55.954], deanStart],
    highlightTag: "Cobbles & river gorge",
  },

  // --- Calton Hill & East End ---
  {
    hubId: "calton-hill",
    name: "Athenian Skyline & Sunset View",
    description: "Climb up to the iconic Dugald Stewart monument overlooking the castle.",
    stops: ["dugaldStewart", "nationalMonument"],
    path: [caltonStart, [-3.1835, 55.9538], [-3.1825, 55.9542], [-3.1818, 55.9548], [-3.183, 55.954], caltonStart],
    highlightTag: "Classic sunset skyline",
  },
  {
    hubId: "calton-hill",
    name: "The East End Monument Walk",
    description: "Wander among the Parthenon-inspired columns and historic astronomical observatory.",
    stops: ["dugaldStewart", "nationalMonument", "nelsonMonument"],
    path: [caltonStart, [-3.1835, 55.9538], [-3.1818, 55.9548], [-3.1825, 55.9542], [-3.182, 55.9535], caltonStart],
    highlightTag: "Athens of the North",
  },
  {
    hubId: "calton-hill",
    name: "Calton Hill to Canongate Wynds",
    description: "Descend from panoramic heights into the quiet historic closes of the lower Royal Mile.",
    stops: ["nationalMonument", "regentTerrace", "whiteHorseClose"],
    path: [caltonStart, [-3.1818, 55.9548], [-3.1795, 55.953], [-3.178, 55.9525], [-3.1764, 55.9526], [-3.181, 55.9535], caltonStart],
    highlightTag: "Panoramic descent",
  },

  // --- New Town & Stockbridge ---
  {
    hubId: "stockbridge",
    name: "Circus Lane Cobblestones",
    description: "A delightful stroll down Edinburgh’s most beloved curved mews lane.",
    stops: ["circusLane"],
    path: [stockbridgeStart, [-3.2055, 55.9572], [-3.2045, 55.9575], [-3.2035, 55.9578], [-3.2045, 55.9582], stockbridgeStart],
    highlightTag: "Floral mews lane",
  },
  {
    hubId: "stockbridge",
    name: "Stockbridge Village & Riverside Gardens",
    description: "From cobbled mews to the green river banks and bohemian cafe quarter.",
    stops: ["circusLane", "stockbridgeGardens"],
    path: [stockbridgeStart, [-3.2045, 55.9575], [-3.2065, 55.9582], [-3.2078, 55.9587], [-3.206, 55.957], stockbridgeStart],
    highlightTag: "Village charm",
  },
  {
    hubId: "stockbridge",
    name: "Georgian Crescents & Secret Pleasure Gardens",
    description: "Explore Robert Adam's neoclassical symmetry and leafy private garden squares.",
    stops: ["circusLane", "queenStreetGardens", "charlotteSquare"],
    path: [stockbridgeStart, [-3.2045, 55.9575], [-3.1965, 55.9555], [-3.201, 55.9535], [-3.2065, 55.9525], [-3.206, 55.956], stockbridgeStart],
    highlightTag: "Georgian splendour",
  },

  // --- Leith & The Shore ---
  {
    hubId: "leith",
    name: "The Shore Historic Quays",
    description: "Stroll along the historic waterfront lined with converted 17th-century merchant warehouses.",
    stops: ["theShore", "customHouse"],
    path: [leithStart, [-3.1695, 55.9752], [-3.1702, 55.9748], [-3.1708, 55.9745], [-3.17, 55.9748], leithStart],
    highlightTag: "Maritime waterfront",
  },
  {
    hubId: "leith",
    name: "Maritime Harbor Basin & Footpath",
    description: "Follow the harbor basin to the river mouth where Antony Gormley's statue looks out to sea.",
    stops: ["theShore", "customHouse", "leithBasin"],
    path: [leithStart, [-3.1695, 55.9752], [-3.1708, 55.9745], [-3.172, 55.9768], [-3.171, 55.976], leithStart],
    highlightTag: "Harbor & river mouth",
  },
  {
    hubId: "leith",
    name: "Leith Shore to Historic Links",
    description: "From tidal docks to the sprawling open greens where the rules of golf were first written.",
    stops: ["theShore", "leithBasin", "leithLinks"],
    path: [leithStart, [-3.1695, 55.9752], [-3.172, 55.9768], [-3.166, 55.973], [-3.1625, 55.9715], [-3.167, 55.974], leithStart],
    highlightTag: "Historic commons & docks",
  },

  // --- Holyrood & Arthur's Seat ---
  {
    hubId: "holyrood",
    name: "Royal Palace & Parliament Forecourt",
    description: "A scenic promenade along the royal palace and modern organic parliament grounds.",
    stops: ["holyroodPalace", "scottishParliament"],
    path: [holyroodStart, [-3.1748, 55.9518], [-3.1735, 55.9522], [-3.1723, 55.9528], [-3.1738, 55.9522], holyroodStart],
    highlightTag: "Palace gates & crags",
  },
  {
    hubId: "holyrood",
    name: "Salisbury Crags Volcanic Edge",
    description: "Rise above the city along the base of the dramatic dolerite cliffs of the Radical Road.",
    stops: ["scottishParliament", "salisburyCrags"],
    path: [holyroodStart, [-3.1748, 55.9518], [-3.1715, 55.9495], [-3.1695, 55.9475], [-3.173, 55.949], holyroodStart],
    highlightTag: "Volcanic cliff views",
  },
  {
    hubId: "holyrood",
    name: "Crags & St Anthony's Chapel Ruins",
    description: "A wild highland wander inside the city, passing romantic ruins above St Margaret's Loch.",
    stops: ["scottishParliament", "salisburyCrags", "stAnthonysChapel"],
    path: [holyroodStart, [-3.1748, 55.9518], [-3.1695, 55.9475], [-3.165, 55.949], [-3.1615, 55.9512], [-3.168, 55.952], holyroodStart],
    highlightTag: "Ancient chapel ruins",
  },
];

const destination: [number, number] = [DEMO_DESTINATION.lng, DEMO_DESTINATION.lat];
// Fixed museum-bound illustrations: Forrest Road / George IV Bridge, or
// Bristo Square / Potterrow, followed by Chambers Street to the museum.
const destinationFixtures: Fixture[] = [
  { hubId: "destination", name: "Bobby on the way", description: "A sample route past Greyfriars Bobby, then along Chambers Street to the museum.", stops: ["greyfriars"], path: [meadowsStart, [-3.1904, 55.94455], [-3.1914, 55.9446], [-3.1916, 55.9455], [-3.1921, 55.9469], [-3.1918, 55.94705], [-3.1904, 55.947], destination], highlightTag: "Old Town stories" },
  { hubId: "destination", name: "A grand arrival", description: "A sample museum-bound wander past Teviot and McEwan Hall, via Bristo Square and Potterrow.", stops: ["teviot", "mcewan"], path: [meadowsStart, [-3.1905, 55.9437], [-3.189, 55.9437], [-3.189, 55.94395], [-3.1876, 55.94415], [-3.18755, 55.9447], [-3.188, 55.9451], [-3.1877, 55.94525], [-3.18785, 55.94695], destination], highlightTag: "Grand university landmarks" },
  { hubId: "destination", name: "The leafy way there", description: "A sample detour by George Square Gardens before approaching the museum along Potterrow and Chambers Street.", stops: ["george"], path: [meadowsStart, [-3.1905, 55.9437], [-3.1894, 55.94365], [-3.1883, 55.94365], [-3.1873, 55.94365], [-3.1873, 55.94405], [-3.1876, 55.94415], [-3.1877, 55.94525], [-3.18785, 55.94695], destination], highlightTag: "Georgian garden approach" },
];

function pathDistance(path: [number, number][]) {
  const radians = Math.PI / 180;
  return path.slice(1).reduce((sum, point, index) => {
    const previous = path[index];
    const a =
      Math.sin(((point[1] - previous[1]) * radians) / 2) ** 2 +
      Math.cos(previous[1] * radians) *
        Math.cos(point[1] * radians) *
        Math.sin(((point[0] - previous[0]) * radians) / 2) ** 2;
    return sum + 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  }, 0);
}

function selectCandidateFixtures(request: GenerateRequest): Fixture[] {
  if (request.mode === "destination") return destinationFixtures;

  // If explicitly near another hub, filter for that hub
  const nearestHub = EDINBURGH_HUBS.map((hub) => ({
    hub,
    dist: distanceMeters(request.start, hub.coordinates),
  })).sort((a, b) => a.dist - b.dist)[0];

  // If the user's start is significantly closer to another hub than the Meadows, prioritize that hub
  if (nearestHub && nearestHub.dist < 800 && nearestHub.hub.id !== "meadows") {
    const districtFixtures = fixtures.filter((f) => f.hubId === nearestHub.hub.id);
    if (districtFixtures.length >= 3) return districtFixtures;
  }

  // Otherwise, default to the rich Southside / Meadows / Old Town fixtures
  return fixtures.filter((f) => f.hubId === "meadows");
}

export function generateDemoRoutes(request: GenerateRequest): WanderRoute[] {
  const candidates = selectCandidateFixtures(request);

  const mapped = candidates.map((fixture, index): WanderRoute => {
    const stops: Place[] = fixture.stops.map((key) => EDINBURGH_POINTS[key]);
    const lastStop = stops.at(-1)!;

    let path = fixture.path;
    if (request.mode === "explore") {
      const stopIndex = fixture.path.findIndex(
        (point) => Math.abs(point[0] - lastStop.lng) < 0.00001 && Math.abs(point[1] - lastStop.lat) < 0.00001
      );
      path = stopIndex >= 0 ? fixture.path.slice(0, stopIndex + 1) : fixture.path.slice(0, Math.max(2, fixture.path.length - 1));
    }

    const distanceMetersVal = Math.round(pathDistance(path));
    const walkingMinutes = Math.ceil(distanceMetersVal / 70);
    const stopMinutes = stops.length * 2;
    const bufferMinutes = Math.max(2, Math.ceil(walkingMinutes * 0.1));
    const totalMinutes = walkingMinutes + stopMinutes + bufferMinutes;

    return {
      id: `demo-${fixture.hubId}-${request.mode}-${index}`,
      name: fixture.name,
      description: fixture.description,
      geometry: { type: "LineString", coordinates: path },
      stops,
      distanceMeters: distanceMetersVal,
      walkingMinutes,
      stopMinutes,
      bufferMinutes,
      totalMinutes,
      score: scorePlaces(stops, request.mood, request.visitedIds),
      highlights: [
        fixture.highlightTag || (stops[0].category === "park" ? "A little green space" : "Local discoveries"),
        request.mode === "loop" ? "Back where you started" : request.mode === "destination" ? "Finish at the museum" : "A fresh finish",
        "Illustrative sample route",
      ],
      isLoop: request.mode === "loop",
      source: "demo",
      ...(request.mode === "destination" ? { destination: DEMO_DESTINATION } : {}),
    };
  });

  // Filter routes that fit within the duration budget
  const fitting = mapped.filter((route) => route.totalMinutes <= request.duration);
  if (fitting.length > 0) {
    return rankRoutes(fitting);
  }

  // Graceful fallback: if no route fits within the selected budget and it's a valid duration,
  // return the closest options flagged with exceedsBudget so the UI displays the maroon path and warning.
  if (request.duration >= 15) {
    const overBudgetRoutes = mapped.map((route) => ({
      ...route,
      exceedsBudget: true,
      budgetMinutes: request.duration,
      highlights: ["Exceeds time budget", ...route.highlights.slice(0, 2)],
    }));
    return rankRoutes(overBudgetRoutes);
  }

  return [];
}
