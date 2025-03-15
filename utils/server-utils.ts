import servers from '@/hooks/servers.json';

export interface MTServer {
  id: string;
  name: string;
  company: string;
}

export const getMetaTraderServers = (): MTServer[] => {
  try {
    // Add defensive checks to handle unexpected data structure
    if (!Array.isArray(servers)) {
      console.error("servers.json does not contain an array:", servers);
      return [];
    }

    return servers
      .filter(server =>
        // Filter out any malformed server entries
        server &&
        server.serverInfoEx &&
        server.serverInfoEx.serverName
      )
      .map(server => ({
        id: server.serverInfoEx.serverName,
        name: server.serverInfoEx.serverName,
        company: server.serverInfoEx.companyName || 'Unknown'
      }))
      .sort((a, b) => {
        // Sort Deriv servers first, then alphabetically
        const isDerivA = a.name.includes('Deriv');
        const isDerivB = b.name.includes('Deriv');
        if (isDerivA && !isDerivB) return -1;
        if (!isDerivA && isDerivB) return 1;
        return a.name.localeCompare(b.name);
      });
  } catch (error) {
    console.error("Error processing server data:", error);
    return [];
  }
};
