import posthog from 'posthog-js';

export const initPostHog = () => {
  posthog.init('phc_fwRv0kOBY00zAgocCCyeJZgAxXcPSV64OzuOHenC2jd', {
    api_host: 'https://eu.posthog.com',
    loaded: (posthog) => {
      if (process.env.NODE_ENV === 'development') {
        console.log('PostHog initialized');
      }
    }
  });
};

export default posthog;