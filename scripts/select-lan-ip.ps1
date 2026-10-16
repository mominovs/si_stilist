# Read-only: print one reachable LAN address for run-local.bat, or nothing if unavailable.
# Use adapter metadata rather than names, which can be localized or renamed.
$ErrorActionPreference = 'Stop'

function Get-LanIpv4([int]$InterfaceIndex, [switch]$PrivateOnly) {
    $addresses = @(Get-NetIPAddress -InterfaceIndex $InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.AddressState -eq 'Preferred' -and -not $_.SkipAsSource -and $_.IPAddress -notmatch '^(127\.|169\.254\.)' })
    if ($PrivateOnly) {
        $addresses = @($addresses | Where-Object { $_.IPAddress -match '^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)' })
    }
    $addresses | Select-Object -First 1 -ExpandProperty IPAddress
}

try {
    $adapters = @(Get-NetAdapter -IncludeHidden | Where-Object { $_.Status -eq 'Up' })
    foreach ($adapter in ($adapters | Where-Object { $_.InterfaceDescription -like 'Microsoft Wi-Fi Direct*' } | Sort-Object ifIndex)) {
        $address = Get-LanIpv4 -InterfaceIndex $adapter.ifIndex -PrivateOnly
        if ($address) {
            Write-Output $address
            exit 0
        }
    }
    foreach ($adapter in ($adapters | Where-Object { $_.HardwareInterface } | Sort-Object ifIndex)) {
        $configuration = Get-NetIPConfiguration -InterfaceIndex $adapter.ifIndex
        if (-not $configuration.IPv4DefaultGateway) { continue }
        $address = Get-LanIpv4 -InterfaceIndex $adapter.ifIndex
        if ($address) {
            Write-Output $address
            exit 0
        }
    }
} catch {
    # The application keeps its existing automatic selection when discovery is unavailable.
}
