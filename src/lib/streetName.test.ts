import { describe, expect, it } from "vitest";
import { formatStreetName, formatStreetPair, formatStreetText } from "./streetName";
import { formatStationName } from "./streetName";

describe("formatStreetName", () => {
  it.each([
    ["Grand St", "Grand Street"],
    ["Essex St", "Essex Street"],
    ["W 44 St", "West 44 Street"],
    ["W 44th St", "West 44th Street"],
    ["E Broadway", "East Broadway"],
    ["8 Av", "8 Avenue"],
    ["Park Ave", "Park Avenue"],
    ["Av A", "Avenue A"],
    ["Ave of the Americas", "Avenue of the Americas"],
    ["St Marks Pl", "St. Marks Place"],
    ["St Nicholas Ave", "St. Nicholas Avenue"],
    ["Ocean Pkwy", "Ocean Parkway"],
    ["Brooklyn Queens Expy", "Brooklyn Queens Expressway"],
    ["Henry Hudson Pkwy", "Henry Hudson Parkway"],
    ["Union Sq E", "Union Square East"],
    ["Grand Concourse", "Grand Concourse"],
    ["Ocean Blvd", "Ocean Boulevard"],
    ["Maiden Ln", "Maiden Lane"],
    ["Riverside Dr", "Riverside Drive"],
    ["Cooper Sq", "Cooper Square"],
    ["Prospect Park Ter", "Prospect Park Terrace"],
    ["Cadman Plz W", "Cadman Plaza West"],
    ["Court Sq", "Court Square"],
    ["Washington Ct", "Washington Court"],
    ["Linden Blvd", "Linden Boulevard"],
    ["Broadway", "Broadway"],
    ["Avenue S", "Avenue S"],
    ["Av S", "Avenue S"],
    ["W 4 St", "West 4 Street"],
    ["N 7 St", "North 7 Street"],
    ["GRAND ST", "Grand Street"],
    ["ST MARKS PL", "St. Marks Place"],
    ["Pelham Pkwy S", "Pelham Parkway South"],
    ["", ""],
  ])("%s → %s", (input, want) => {
    expect(formatStreetName(input)).toBe(want);
  });
  it("leaves an already-spelled name alone", () => {
    expect(formatStreetName("West 44th Street")).toBe("West 44th Street");
  });
  it("formats both halves of a corner", () => {
    expect(formatStreetPair("Grand St & Essex St")).toBe("Grand Street & Essex Street");
    expect(formatStreetPair("W 44 St at 8 Av")).toBe("West 44 Street at 8 Avenue");
  });
});

describe("formatStreetText", () => {
  it.each([
    ["385 Grand St, Manhattan", "385 Grand Street, Manhattan"],
    ["Turn left onto W 44 St", "Turn left onto West 44 Street"],
    ["Use the NE exit near E 42 St & Lexington Av", "Use the NE exit near East 42 Street & Lexington Avenue"],
    ["GRAND ST/ESSEX ST", "Grand Street/Essex Street"],
    ["ESSEX ST/DELANCEY ST", "Essex Street/Delancey Street"],
    ["Meet at St Marks Pl", "Meet at St. Marks Place"],
    ["Walk to Avenue A", "Walk to Avenue A"],
    ["Walk to Av A", "Walk to Avenue A"],
    ["Continue on Broadway", "Continue on Broadway"],
    ["Times Square park, 7 Av", "Times Square park, 7 Avenue"],
    ["", ""],
  ])("%s → %s", (input, want) => {
    expect(formatStreetText(input)).toBe(want);
  });
});

describe("formatStationName", () => {
  it.each([
    ["Times Sq-42 St", "Times Square-42 Street"],
    ["14 St-Union Sq", "14 Street-Union Square"],
    ["W 4 St-Wash Sq", "West 4 Street-Washington Square"],
    ["Jackson Hts-Roosevelt Av", "Jackson Heights-Roosevelt Avenue"],
    ["Atlantic Av-Barclays Ctr", "Atlantic Avenue-Barclays Center"],
    ["Ft Hamilton Pkwy", "Fort Hamilton Parkway"],
    ["Lexington Av/59 St", "Lexington Avenue/59 Street"],
    ["Kew Gardens-Union Tpke", "Kew Gardens-Union Turnpike"],
    ["St Lawrence Av", "St. Lawrence Avenue"],
    ["Bedford Park Blvd-Lehman College", "Bedford Park Boulevard-Lehman College"],
    ["Grand Central-42 St", "Grand Central-42 Street"],
    ["Coney Island-Stillwell Av", "Coney Island-Stillwell Avenue"],
    ["Mt Eden Av", "Mount Eden Avenue"],
    ["Botanic Garden", "Botanic Garden"],
    ["It is 500 ft past the exit", "It is 500 ft past the exit"],
    ["Take the 4 from 14 St-Union Sq to Grand Central-42 St.", "Take the 4 from 14 Street-Union Square to Grand Central-42 Street."],
  ])("%s → %s", (raw, out) => expect(formatStationName(raw)).toBe(out));
});
