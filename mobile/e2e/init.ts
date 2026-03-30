import { device } from "detox";

jest.setTimeout(180000);

beforeEach(async () => {
  await device.launchApp({
    delete: true,
    newInstance: true,
    permissions: {
      notifications: "YES",
    },
  });
});
