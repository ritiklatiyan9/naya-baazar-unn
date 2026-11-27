import { entrancePoint } from "./entranceLayout";
import { cameraRoute, plan, type Shot, type XYZ } from "./cameraRoute";
import { firstFloorWalkthrough } from "./upperWalkthrough";
import { shopFloorHeight } from "./retailFrontages";

const eyeHeight = shopFloorHeight.ground + 1.58;
function gate(x: number, z: number, height = eyeHeight): XYZ {
  const p = entrancePoint(x, z);
  return [p.x, height, p.y];
}

// Frame the two palm verges, fountain sign and east roof tip from the reference.
const entranceEye = gate(-4.70, 19.88);
const entranceLook = gate(-.64, 12.99, eyeHeight - .52);
const rearGalleryView = plan(644, 687, 1.74);
export const DELIVERY_SHOT_START = 110;

// Eye and look marks are separate. The lens can linger on merchandise while backing
// through the same doorway, or pan to the next destination before taking a turn.
const shots: Shot[] = [
  { time: 0, eye: entranceEye, look: entranceLook, chapter: "Entrance road" },
  { time: 2, eye: entranceEye, look: entranceLook },
  { time: 7, eye: gate(-4.10, 12), look: plan(382, 745, 2.05) },
  { time: 13, eye: gate(-3.05, .8), look: plan(356, 680, 1.92) },
  { time: 17, eye: plan(318, 736), look: plan(309, 663, 1.98) },
  { time: 21, eye: plan(315, 694), look: plan(264, 634, 1.87), chapter: "Left arcade" },
  { time: 25, eye: plan(291, 665), look: plan(251, 612, 1.82) },
  { time: 29, eye: plan(268, 642), look: plan(283, 611, 1.83), chapter: "Thread clothing atelier" },
  // Shop 102. Approach on the centreline of its door, walk up the entry aisle between the wall rail
  // and the free-standing rail, and turn to the rear wall and the counter from inside the shop.
  { time: 31, eye: plan(268.48, 629.6), look: plan(295.2, 596.4, 1.68) },
  { time: 34, eye: plan(279.67, 615.72), look: plan(295.2, 596.4, 1.48) },
  { time: 36, eye: plan(284.86, 609.29), look: plan(297, 605, 1.50) },
  { time: 38, eye: plan(288.68, 604.55), look: plan(300.5, 598.5, 1.46) },
  { time: 40, eye: plan(291.4, 601.2), look: plan(299, 584.5, 1.38) },
  { time: 42, eye: plan(291.4, 601.2), look: plan(296.5, 578.5, 1.57) },
  { time: 44, eye: plan(281.0, 614.1), look: plan(295.2, 596.4, 1.82) },
  { time: 46, eye: plan(267, 639.5), look: plan(241, 609, 1.85) },
  { time: 49, eye: plan(226, 602), look: plan(217, 564, 1.91), chapter: "Behind the west pavilion" },
  { time: 52, eye: plan(213, 582), look: plan(247, 531, 1.89) },
  { time: 56, eye: plan(235, 548), look: plan(271, 497, 1.86) },
  { time: 61, eye: plan(269, 503), look: plan(307, 479, 1.87) },
  { time: 65, eye: plan(298, 491), look: plan(423, 504, 2.40), chapter: "West pavilion panorama" },
  { time: 70, eye: plan(303, 491), look: plan(725, 559, 2.03) },
  { time: 76, eye: plan(319, 494), look: plan(655, 645, 1.78) },
  { time: 81, eye: plan(347, 497), look: plan(428, 530, 1.84), chapter: "Shopfront promenade" },
  { time: 87, eye: plan(383, 505), look: plan(654, 559, 1.92) },
  { time: 96, eye: plan(532, 545), look: plan(717, 548, 1.87) },
  { time: 104, eye: plan(675, 557), look: plan(805, 554, 2.34) },
  { time: DELIVERY_SHOT_START, eye: plan(752, 504), look: plan(846, 397, 1.71), chapter: "Delivery lane" },
  { time: 117, eye: plan(796, 411), look: plan(870, 326, 1.44) },
  { time: 122, eye: plan(796, 373), look: plan(873, 343, 1.44) },
  { time: 126, eye: plan(797, 349), look: plan(872, 321, 1.44) },
  { time: 131, eye: plan(798, 315), look: plan(872, 285, 1.42) },
  { time: 135, eye: plan(798, 315), look: plan(873, 281, 1.50) },
  { time: 139, eye: plan(798, 329), look: plan(873, 362, 1.57) },
  { time: 145, eye: plan(795, 410), look: plan(777, 512, 1.86) },
  { time: 153, eye: plan(757, 508), look: plan(860, 638, 2.12) },
  // Approach the rosette from the carriageway, loop around the café pavilion
  // through its south, east and north passages, then rejoin the west arcade.
  { time: 154, eye: plan(749.14, 516.50), look: plan(789.77, 572.91, 1.98), chapter: "Courtyard panorama" },
  // Linger at the edge of the road while a car passes before crossing to the plaza.
  { time: 158.5, eye: plan(751, 517.5), look: plan(847, 654, 2.18) },
  { time: 164, eye: plan(783, 556), look: plan(879, 657, 2.22) },
  { time: 170, eye: plan(815, 601), look: plan(917, 676, 1.97) },
  { time: 175, eye: plan(840, 649), look: plan(965, 707, 1.78) },
  { time: 180, eye: plan(873, 690), look: plan(1031, 706, 2.00) },
  { time: 185, eye: plan(932, 709), look: plan(1087, 715, 1.95), chapter: "Café pavilion promenade" },
  { time: 191, eye: plan(1004, 720), look: plan(1117, 685, 2.15) },
  { time: 199, eye: plan(1104, 726), look: plan(1190, 716, 1.91) },
  { time: 205, eye: plan(1174, 728), look: plan(1222, 692, 2.10) },
  { time: 209, eye: plan(1207, 724), look: plan(1218, 651, 1.99) },
  { time: 213, eye: plan(1219, 681), look: plan(1199, 628, 2.14), chapter: "Behind the café pavilion" },
  { time: 219, eye: plan(1219, 619), look: plan(1198, 571, 2.16) },
  { time: 224, eye: plan(1205, 595), look: plan(1110, 581, 1.98) },
  { time: 229, eye: plan(1153, 593), look: plan(1042, 588, 1.93) },
  { time: 237, eye: plan(1046, 592), look: plan(938, 602, 2.12) },
  { time: 239.5, eye: plan(1020, 589.5), look: plan(914, 589, 2.07) },
  { time: 241, eye: plan(1005, 583), look: plan(897, 607, 2.02) },
  { time: 244, eye: plan(969, 569), look: plan(877, 619, 2.00) },
  { time: 248, eye: plan(927, 565), look: plan(817, 629, 1.85), chapter: "Return across the courtyard" },
  { time: 255, eye: plan(851, 572), look: plan(739, 625, 1.88) },
  { time: 263, eye: plan(789, 589), look: plan(682, 631, 1.98) },
  { time: 269, eye: plan(735, 606), look: plan(649, 631, 2.07) },
  { time: 276, eye: plan(704, 593), look: plan(623, 663, 2.09) },
  { time: 281, eye: plan(675, 552), look: plan(617, 662, 2.14) },
  { time: 290, eye: plan(520, 531), look: plan(374, 515, 1.88) },
  { time: 298, eye: plan(405, 513), look: plan(307, 490, 1.92) },
  { time: 303, eye: plan(348, 496), look: plan(320, 517, 1.89) },
  // Finish alongside the pavilion glass with the curving mall and distant
  // courtyard tree framed between the near shop window and the left colonnade.
  { time: 307, eye: plan(324, 506), look: plan(419, 595, 1.83), chapter: "Courtyard from the arcade" },
  { time: 313, eye: plan(324, 506), look: rearGalleryView },
  { time: 316, eye: plan(324, 506), look: rearGalleryView },
];

const groundWalkthrough = { ...cameraRoute(shots), shopTime: 42 };
export const walkthroughs = { ground: groundWalkthrough, first: firstFloorWalkthrough };
