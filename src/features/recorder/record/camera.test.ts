import { describe, expect, it } from "vitest";
import { cameraName } from "./camera";

describe("cameraName", () => {
  const cams = [{ deviceId: "a", label: "FaceTime HD Camera (05ac:8514)" }, { deviceId: "b", label: "" }, { deviceId: "c", label: "camera2 0, facing back" }];
  it("gives the browser's name without the hardware code", () => {
    expect(cameraName(cams, "a")).toBe("FaceTime HD Camera");
    expect(cameraName(cams, "c")).toBe("camera2 0, facing back");
  });
  it("numbers a camera the browser does not name", () => expect(cameraName(cams, "b")).toBe("Camera 2"));
  it("says nothing when the live camera is not in the list", () => {
    expect(cameraName(cams, null)).toBe("");
    expect(cameraName(cams, "gone")).toBe("");
  });
});
