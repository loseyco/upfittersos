/**
 * Utility for persisting user's preference between Job View versions ('v3' vs 'classic')
 * and launching standalone popup windows.
 */

export function getPreferredJobViewVersion(): 'v3' | 'classic' {
  return (localStorage.getItem('upfitters_job_view_version') as 'v3' | 'classic') || 'classic';
}

export function setPreferredJobViewVersion(version: 'v3' | 'classic') {
  localStorage.setItem('upfitters_job_view_version', version);
}

export function getPreferredJobUrl(tenantId: string, jobId: string): string {
  const version = getPreferredJobViewVersion();
  return version === 'v3'
    ? `/business/${tenantId}/jobv3/${jobId}`
    : `/business/${tenantId}/job/${jobId}`;
}

export function openJobPopupWindow(
  urlOrTenantId: string, 
  jobId?: string, 
  e?: React.MouseEvent | Event
) {
  if (e) {
    if ('preventDefault' in e && typeof e.preventDefault === 'function') e.preventDefault();
    if ('stopPropagation' in e && typeof e.stopPropagation === 'function') e.stopPropagation();
  }

  let finalUrl = urlOrTenantId;

  // If passed tenantId and jobId as first two args:
  if (jobId && !urlOrTenantId.includes('/')) {
    finalUrl = getPreferredJobUrl(urlOrTenantId, jobId);
  } else if (jobId) {
    // Standardize URL based on user's saved localStorage preference
    const version = getPreferredJobViewVersion();
    if (version === 'v3') {
      finalUrl = urlOrTenantId.replace('/job/', '/jobv3/');
    } else {
      finalUrl = urlOrTenantId.replace('/jobv3/', '/job/');
    }
  }

  // Ensure popup query param is present for minimized sidebar in standalone windows
  if (!finalUrl.includes('popup=')) {
    finalUrl += (finalUrl.includes('?') ? '&' : '?') + 'popup=1';
  }

  const windowName = jobId 
    ? `UpfittersOS_Job_${jobId.replace(/[^a-zA-Z0-9_]/g, '_')}` 
    : `UpfittersOS_Job_${Date.now()}`;

  const width = 1200;
  const height = 880;
  
  // Center window relative to current active monitor screen
  const screenLeft = window.screenLeft !== undefined ? window.screenLeft : (window.screenX || 0);
  const screenTop = window.screenTop !== undefined ? window.screenTop : (window.screenY || 0);
  const windowWidth = window.outerWidth || document.documentElement.clientWidth || screen.width;
  const windowHeight = window.outerHeight || document.documentElement.clientHeight || screen.height;

  const left = Math.max(0, Math.round(screenLeft + (windowWidth - width) / 2));
  const top = Math.max(0, Math.round(screenTop + (windowHeight - height) / 2));

  // 'popup=yes' is the modern Chrome/Edge spec to guarantee a standalone window frame (NOT a tab)
  const windowFeatures = `popup=yes,width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes,status=no,toolbar=no,menubar=no,location=no`;

  const popup = window.open(finalUrl, windowName, windowFeatures);
  
  if (popup) {
    popup.focus();
  }
}
