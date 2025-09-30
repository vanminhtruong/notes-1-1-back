/**
 * Parse device information from user agent string
 * @param {string} userAgent - User agent string from request
 * @returns {object} Parsed device info
 */
const parseDeviceInfo = (userAgent) => {
  if (!userAgent) {
    return {
      deviceType: 'unknown',
      deviceName: 'Unknown Device',
      browser: 'Unknown',
      os: 'Unknown',
    };
  }

  const ua = userAgent.toLowerCase();
  
  // Device Type Detection
  let deviceType = 'desktop';
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(userAgent)) {
    deviceType = 'tablet';
  } else if (/mobile|iphone|ipod|blackberry|opera mini|opera mobi|iemobile/i.test(userAgent)) {
    deviceType = 'mobile';
  }

  // OS Detection
  let os = 'Unknown';
  if (/windows nt 10/i.test(userAgent)) {
    // Windows 11 also reports as NT 10.0, detect via browser version
    // Chrome 110+ or Edge 110+ on Windows NT 10.0 is likely Windows 11
    const chromeMatch = userAgent.match(/chrome\/(\d+)/i);
    const edgeMatch = userAgent.match(/edg\/(\d+)/i);
    const browserVersion = chromeMatch ? parseInt(chromeMatch[1]) : 
                          edgeMatch ? parseInt(edgeMatch[1]) : 0;
    
    if (browserVersion >= 110) {
      os = 'Windows 11';
    } else {
      os = 'Windows 10/11';
    }
  }
  else if (/windows nt 11/i.test(userAgent)) os = 'Windows 11';
  else if (/windows nt 6.3/i.test(userAgent)) os = 'Windows 8.1';
  else if (/windows nt 6.2/i.test(userAgent)) os = 'Windows 8';
  else if (/windows nt 6.1/i.test(userAgent)) os = 'Windows 7';
  else if (/windows/i.test(userAgent)) os = 'Windows';
  else if (/mac os x 10[._](\d+)/i.test(userAgent)) {
    const match = userAgent.match(/mac os x 10[._](\d+)/i);
    os = `macOS 10.${match[1]}`;
  } else if (/mac os x/i.test(userAgent)) os = 'macOS';
  else if (/iphone/i.test(userAgent)) os = 'iOS (iPhone)';
  else if (/ipad/i.test(userAgent)) os = 'iOS (iPad)';
  else if (/android (\d+)/i.test(userAgent)) {
    const match = userAgent.match(/android (\d+)/i);
    os = `Android ${match[1]}`;
  } else if (/android/i.test(userAgent)) os = 'Android';
  else if (/linux/i.test(userAgent)) os = 'Linux';
  else if (/ubuntu/i.test(userAgent)) os = 'Ubuntu';

  // Browser Detection
  let browser = 'Unknown';
  if (/edg\//i.test(userAgent)) browser = 'Edge';
  else if (/chrome|crios|crmo/i.test(userAgent) && !/edg/i.test(userAgent)) browser = 'Chrome';
  else if (/firefox|fxios/i.test(userAgent)) browser = 'Firefox';
  else if (/safari/i.test(userAgent) && !/chrome|crios|crmo/i.test(userAgent)) browser = 'Safari';
  else if (/opera|opr\//i.test(userAgent)) browser = 'Opera';
  else if (/msie|trident/i.test(userAgent)) browser = 'Internet Explorer';

  // Device Name
  let deviceName = `${os}`;
  if (deviceType === 'mobile') {
    if (/iphone/i.test(userAgent)) deviceName = 'iPhone';
    else if (/android/i.test(userAgent)) deviceName = 'Android Phone';
    else deviceName = 'Mobile Device';
  } else if (deviceType === 'tablet') {
    if (/ipad/i.test(userAgent)) deviceName = 'iPad';
    else if (/android/i.test(userAgent)) deviceName = 'Android Tablet';
    else deviceName = 'Tablet';
  } else {
    deviceName = `${browser} on ${os}`;
  }

  return {
    deviceType,
    deviceName,
    browser,
    os,
  };
};

module.exports = {
  parseDeviceInfo,
};
