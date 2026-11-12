/**
 * The BPO & Virtual Assistant agency domain list: the companies Lead Finder's
 * "BPO & Virtual Assistant Agencies" preset searches (any provider). The OA_* names are legacy.
 */
import type { IcpFilters } from '@/lib/leadData/types';

export const OA_DIRECTORY_BPO_DOMAINS: string[] = [
  'cloudstaff.com',
  'boothandpartners.com',
  'shoreagents.com',
  'outsourced.ph',
  'bruntwork.co',
  'multiplymii.com',
  'wingassistant.com',
  'athena.com',
  'cyberbacker.com',
  'microsourcing.com',
  'kmc.solutions',
  'remotestaff.com.au',
  'flatplanet.com.au',
  'emsoutsource.com',
  'stealthagents.com',
  'virtudesk.com',
  'myoutdesk.com',
  'boldr.com',
  'boldrimpact.com',
  'supportninja.com',
  'taskus.com',
  'acquirebpo.com',
  'staffdomain.com',
  'satelliteoffice.com',
  'offshoremvp.com',
  'kineticstaff.com',
  'hammerjack.com.au',
  'somewhere.com',
  'emapta.com',
  'concentrix.com',
  'foundever.com',
  'teleperformance.com',
  'alorica.com',
  ' Sutherlandglobal.com',
  'probe-group.com',
  'probecx.com',
  'connectos.co',
  'penbrothers.com',
  'filtaglobal.com',
  'diversifyoss.com',
  'eastvantage.com',
  'fullscale.io',
  'coopsys.com',
  'superstaff.com',
  'infinit-o.com',
  'magellan-solutions.com',
  'piton-global.com',
  'openaccessbpo.com',
  'helpware.com',
  '247-inc.com',
  'startek.com',
  'vxi.com',
  'ibex.co',
  'tdcx.com',
  'everise.com',
  'connext.solutions',
  'connextglobal.com',
  'beepo.com.au',
  'teamglobal.com.au',
  'offshorly.com',
  'scalableos.com',
  'smartoutsourcing.co.uk',
  'deployed.co',
  'kamelbpo.com',
  'selectvoicecom.com',
  'philippinecompanies.com',
  'virtuallyincredible.com',
  'outsourcey.com',
  'ClearSourceBPO.com',
  'optimbpo.com',
  'personiv.com',
  ' Hugoinc.com',
  'intelepeer.com',
].map((d) => d.trim().toLowerCase());

/**
 * True when the filters pick the BPO & Virtual Assistant agencies preset. The legacy strings
 * below are still matched because older saved searches may contain them (matching only, never shown).
 */
export function isOaBpoDirectorySearch(filters: Pick<IcpFilters, 'industry' | 'companyKeywords'>): boolean {
  const indLower = (filters.industry || '').toLowerCase();
  const kwLower = (filters.companyKeywords || '').toLowerCase();
  return (
    indLower.includes('outsource accelerator') ||
    kwLower.includes('outsourceaccelerator.com') ||
    indLower.includes('bpo & virtual assistant')
  );
}
