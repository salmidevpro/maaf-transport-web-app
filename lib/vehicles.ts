export type VehicleStatus = "Active" | "Under review" | "Suspended";

export type Vehicle = {
  id: string;
  plate: string;
  make: string;
  model: string;
  year: number;
  type: string;
  color: string;
  operator: string;
  phone: string;
  route: string;
  status: VehicleStatus;
  registeredAt: string;
  lastVerified: string;
};


export const seedVehicles: Vehicle[] = [
  {
    id: "MAAF-24018",
    plate: "LND 482 XY",
    make: "Toyota",
    model: "Hiace",
    year: 2022,
    type: "Minibus",
    color: "White",
    operator: "Amina Yusuf",
    phone: "+234 803 555 0118",
    route: "Ikeja — CMS",
    status: "Active",
    registeredAt: "2026-10-28",
    lastVerified: "Today, 08:42",
  },
  {
    id: "MAAF-24017",
    plate: "ABC 901 DE",
    make: "Toyota",
    model: "Coaster",
    year: 2021,
    type: "Bus",
    color: "Blue / white",
    operator: "Tunde Balogun",
    phone: "+234 806 204 7811",
    route: "Yaba — Victoria Island",
    status: "Active",
    registeredAt: "2026-10-27",
    lastVerified: "Today, 08:19",
  },
  {
    id: "MAAF-24016",
    plate: "KJA 332 AA",
    make: "Honda",
    model: "Civic",
    year: 2020,
    type: "Taxi",
    color: "Black",
    operator: "Chika Okafor",
    phone: "+234 809 177 2401",
    route: "Airport — Ikeja",
    status: "Under review",
    registeredAt: "2026-10-26",
    lastVerified: "Yesterday, 17:05",
  },
  {
    id: "MAAF-24015",
    plate: "MUS 619 FG",
    make: "Nissan",
    model: "Urvan",
    year: 2019,
    type: "Minibus",
    color: "Silver",
    operator: "Suleiman Musa",
    phone: "+234 802 448 9820",
    route: "Ojota — Mile 2",
    status: "Active",
    registeredAt: "2026-10-25",
    lastVerified: "Today, 07:54",
  },
  {
    id: "MAAF-24014",
    plate: "EPE 220 HT",
    make: "Suzuki",
    model: "Carry",
    year: 2018,
    type: "Delivery van",
    color: "White",
    operator: "Grace Nwosu",
    phone: "+234 805 040 8825",
    route: "Lekki — Epe",
    status: "Suspended",
    registeredAt: "2026-10-23",
    lastVerified: "Oct 30, 14:11",
  },
  {
    id: "MAAF-24013",
    plate: "LSD 704 QK",
    make: "Toyota",
    model: "Sienna",
    year: 2023,
    type: "Taxi",
    color: "Grey",
    operator: "Bola Adeyemi",
    phone: "+234 812 771 3390",
    route: "Surulere — CMS",
    status: "Active",
    registeredAt: "2026-10-22",
    lastVerified: "Today, 07:22",
  },
];
