import { expect, test } from "playwright/test";

import { FacebookError } from "@/lib/facebook/errors";
import { normalizeFacebookPostUrl } from "@/lib/facebook/validators";

test("acepta y normaliza formatos de publicación soportados", () => {
  expect(
    normalizeFacebookPostUrl("https://www.facebook.com/share/p/1Bk8eSXe6L/"),
  ).toBe("https://www.facebook.com/share/p/1Bk8eSXe6L/");
  expect(normalizeFacebookPostUrl("https://www.facebook.com/share/18qJQbmByL/")).toBe(
    "https://www.facebook.com/share/18qJQbmByL/",
  );
  expect(
    normalizeFacebookPostUrl("https://facebook.com/page/posts/123?mibextid=test#comments"),
  ).toBe("https://www.facebook.com/page/posts/123");
  expect(
    normalizeFacebookPostUrl("https://www.facebook.com/permalink.php?story_fbid=2&id=1"),
  ).toBe("https://www.facebook.com/permalink.php?story_fbid=2&id=1");
});

test("rechaza navegación arbitraria y formatos de video", () => {
  const invalidUrls = [
    "",
    "no-es-una-url",
    "http://www.facebook.com/share/p/123/",
    "https://facebook.com.evil.test/share/p/123/",
    "https://user:pass@facebook.com/share/p/123/",
    "https://www.facebook.com:444/share/p/123/",
    "https://www.facebook.com/",
    "https://www.facebook.com/share/v/123/",
    "https://www.facebook.com/reel/123/",
  ];

  for (const url of invalidUrls) {
    expect(() => normalizeFacebookPostUrl(url)).toThrow(FacebookError);
  }
});
