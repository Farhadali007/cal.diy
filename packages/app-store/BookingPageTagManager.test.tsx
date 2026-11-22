import { cleanup, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import BookingPageTagManager, { handleEvent, isSafeTagTemplateValue } from "./BookingPageTagManager";

// NOTE:  We don't intentionally mock appStoreMetadata as that also tests config.json and generated files for us for no cost. If it becomes a pain in future, we could just start mocking it.

vi.mock("next/script", () => {
  return {
    default: ({ ...props }) => {
      return <div {...props} />;
    },
  };
});

const windowProps: string[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setOnWindow(prop: any, value: any) {
  window[prop] = value;
  windowProps.push(prop);
}

afterEach(() => {
  windowProps.forEach((prop) => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-expect-error
    delete window[prop];
  });
  windowProps.splice(0);
  cleanup();
});

describe("BookingPageTagManager", () => {
  it("GTM App when enabled should have its scripts added with appropriate trackingID and $pushEvent replacement", () => {
    const GTM_CONFIG = {
      enabled: true,
      trackingId: "GTM-123",
    };
    render(
      <BookingPageTagManager
        eventType={{
          metadata: {
            apps: {
              gtm: GTM_CONFIG,
            },
          },
          price: 0,
          currency: "USD",
        }}
      />
    );
    const scripts = screen.getAllByTestId("cal-analytics-app-gtm");
    const trackingScript = scripts[0];
    const pushEventScript = scripts[1];
    expect(trackingScript.innerHTML).toContain(GTM_CONFIG.trackingId);
    expect(pushEventScript.innerHTML).toContain("cal_analytics_app__gtm");
  });

  it("GTM App when disabled should not have its scripts added", () => {
    const GTM_CONFIG = {
      enabled: false,
      trackingId: "GTM-123",
    };
    render(
      <BookingPageTagManager
        eventType={{
          metadata: {
            apps: {
              gtm: GTM_CONFIG,
            },
          },
          price: 0,
          currency: "USD",
        }}
      />
    );
    const scripts = screen.queryAllByTestId("cal-analytics-app-gtm");
    expect(scripts.length).toBe(0);
  });

  it("should not add scripts for an app that doesnt have tag defined(i.e. non-analytics app)", () => {
    render(
      <BookingPageTagManager
        eventType={{
          metadata: {
            apps: {
              zoomvideo: {
                enabled: true,
              },
            },
          },
          price: 0,
          currency: "USD",
        }}
      />
    );
    const scripts = screen.queryAllByTestId("cal-analytics-app-zoomvideo");
    expect(scripts.length).toBe(0);
  });

  it("should not crash for an app that doesnt exist", () => {
    render(
      <BookingPageTagManager
        eventType={{
          metadata: {
            apps: {
              //@ts-expect-error Testing for non-existent app
              nonexistentapp: {
                enabled: true,
              },
            },
          },
          price: 0,
          currency: "USD",
        }}
      />
    );
    const scripts = screen.queryAllByTestId("cal-analytics-app-zoomvideo");
    expect(scripts.length).toBe(0);
  });

  // CVE-2026-57858: tracking IDs and analytics URLs come from event-type app data,
  // which an event-type owner controls. They must never be substituted unsanitized
  // into the booking page's scripts.
  it("should not substitute a TRACKING_ID that breaks out of the script string", () => {
    render(
      <BookingPageTagManager
        eventType={{
          metadata: {
            apps: {
              gtm: {
                enabled: true,
                trackingId: `x'});alert("xss");//`,
              },
            },
          },
          price: 0,
          currency: "USD",
        }}
      />
    );
    const scripts = screen.getAllByTestId("cal-analytics-app-gtm");
    expect(scripts[0].innerHTML).not.toContain('alert("xss")');
    expect(scripts[0].innerHTML).toContain("{TRACKING_ID}");
  });

  it("should not substitute a TRACKING_ID containing a closing script tag", () => {
    render(
      <BookingPageTagManager
        eventType={{
          metadata: {
            apps: {
              gtm: {
                enabled: true,
                trackingId: `</script><script>alert("xss")</script>`,
              },
            },
          },
          price: 0,
          currency: "USD",
        }}
      />
    );
    const scripts = screen.getAllByTestId("cal-analytics-app-gtm");
    expect(scripts[0].innerHTML).not.toContain('alert("xss")');
    expect(scripts[0].innerHTML).not.toContain("</script><script>");
    expect(scripts[0].innerHTML).toContain("{TRACKING_ID}");
  });

  it("should not substitute a javascript: URL for a URL template variable", () => {
    render(
      <BookingPageTagManager
        eventType={{
          metadata: {
            apps: {
              plausible: {
                enabled: true,
                trackingId: "example.com",
                PLAUSIBLE_URL: `javascript:alert("xss")`,
              },
            },
          },
          price: 0,
          currency: "USD",
        }}
      />
    );
    const scripts = screen.getAllByTestId("cal-analytics-app-plausible");
    expect(scripts[0].getAttribute("src")).not.toContain("javascript:");
    expect(scripts[0].getAttribute("src")).toBe("{PLAUSIBLE_URL}");
  });

  it("should still substitute legitimate IDs and https URLs", () => {
    render(
      <BookingPageTagManager
        eventType={{
          metadata: {
            apps: {
              plausible: {
                enabled: true,
                trackingId: "example.com",
                PLAUSIBLE_URL: "https://plausible.io/js/script.js",
              },
              matomo: {
                enabled: true,
                MATOMO_URL: "https://matomo.example.com",
                SITE_ID: "7",
              },
              umami: {
                enabled: true,
                SITE_ID: "123e4567-e89b-12d3-a456-426614174000",
                SCRIPT_URL: "https://cloud.umami.is/script.js",
              },
            },
          },
          price: 0,
          currency: "USD",
        }}
      />
    );
    expect(screen.getByTestId("cal-analytics-app-plausible").getAttribute("src")).toBe(
      "https://plausible.io/js/script.js"
    );
    expect(screen.getByTestId("cal-analytics-app-plausible").getAttribute("data-domain")).toBe("example.com");
    // Matomo renders two scripts (src + inline content) sharing one test id.
    const matomoScripts = screen.getAllByTestId("cal-analytics-app-matomo");
    expect(matomoScripts[0].getAttribute("src")).toBe("https://matomo.example.com/matomo.js");
    expect(matomoScripts[1].innerHTML).toContain("https://matomo.example.com");
    expect(screen.getByTestId("cal-analytics-app-umami").getAttribute("data-website-id")).toBe(
      "123e4567-e89b-12d3-a456-426614174000"
    );
  });

  it("should substitute a URL value containing $ literally, without replacement-pattern expansion", () => {
    render(
      <BookingPageTagManager
        eventType={{
          metadata: {
            apps: {
              plausible: {
                enabled: true,
                trackingId: "example.com",
                PLAUSIBLE_URL: "https://plausible.io/js/script.js?$&",
              },
            },
          },
          price: 0,
          currency: "USD",
        }}
      />
    );
    expect(screen.getByTestId("cal-analytics-app-plausible").getAttribute("src")).toBe(
      "https://plausible.io/js/script.js?$&"
    );
  });
});

describe("isSafeTagTemplateValue", () => {
  it.each([
    "GTM-123",
    "G-ABC123DEF0",
    "UA-12345678-1",
    "phc_abc123XYZ",
    "123e4567-e89b-12d3-a456-426614174000",
    "example.com",
    "7",
    "Lead",
    "sub.example.com:8080",
  ])("accepts legitimate identifier %s", (value) => {
    expect(isSafeTagTemplateValue(value)).toBe(true);
  });

  it.each([
    "https://us.i.posthog.com",
    "https://matomo.example.com",
    "https://plausible.io/js/script.js",
    "http://localhost:8080/matomo",
    "https://plausible.io/js/script.js?$&",
  ])("accepts legitimate URL %s", (value) => {
    expect(isSafeTagTemplateValue(value)).toBe(true);
  });

  it.each([
    `x'});alert("xss");//`,
    `</script><script>alert("xss")</script>`,
    `javascript:alert("xss")`,
    "data:text/html,<script>alert(1)</script>",
    "//evil.example.com/x.js",
    "https://example.com/a?b=<script>",
    `https://example.com/a'b`,
    'https://example.com/a"b',
    "https://example.com/a b",
    "https://example.com/a\\b",
    "tracking id with spaces",
    "",
    "{TRACKING_ID}",
  ])("rejects unsafe value %s", (value) => {
    expect(isSafeTagTemplateValue(value)).toBe(false);
  });
});

describe("handleEvent", () => {
  it("should not push internal events to analytics apps", () => {
    expect(
      handleEvent({
        detail: {
          // Internal event
          type: "__abc",
        },
      })
    ).toBe(false);

    expect(
      handleEvent({
        detail: {
          // Not an internal event
          type: "_abc",
        },
      })
    ).toBe(true);
  });

  it("should call the function on window with the event name and data", () => {
    const pushEventXyz = vi.fn();
    const pushEventAnything = vi.fn();
    const pushEventRandom = vi.fn();
    const pushEventNotme = vi.fn();

    setOnWindow("cal_analytics_app__xyz", pushEventXyz);
    setOnWindow("cal_analytics_app__anything", pushEventAnything);
    setOnWindow("cal_analytics_app_random", pushEventRandom);
    setOnWindow("cal_analytics_notme", pushEventNotme);

    handleEvent({
      detail: {
        type: "abc",
        key: "value",
      },
    });

    expect(pushEventXyz).toHaveBeenCalledWith({
      name: "abc",
      data: {
        key: "value",
      },
    });

    expect(pushEventAnything).toHaveBeenCalledWith({
      name: "abc",
      data: {
        key: "value",
      },
    });

    expect(pushEventRandom).toHaveBeenCalledWith({
      name: "abc",
      data: {
        key: "value",
      },
    });

    expect(pushEventNotme).not.toHaveBeenCalled();
  });

  it("should not error if accidentally the value is not a function", () => {
    const pushEventNotAfunction = "abc";
    const pushEventAnything = vi.fn();
    setOnWindow("cal_analytics_app__notafun", pushEventNotAfunction);
    setOnWindow("cal_analytics_app__anything", pushEventAnything);

    handleEvent({
      detail: {
        type: "abc",
        key: "value",
      },
    });

    // No error for cal_analytics_app__notafun and pushEventAnything is called
    expect(pushEventAnything).toHaveBeenCalledWith({
      name: "abc",
      data: {
        key: "value",
      },
    });
  });
});
