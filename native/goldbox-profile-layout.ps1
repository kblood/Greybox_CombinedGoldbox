# Canonical local and packaged Gold Box title layouts.  Keep this table shared
# by the player launcher and its regression so a documented wrapper cannot
# silently drift away from profile resolution.
function Get-GoldBoxProfileLayouts {
  @(
    [pscustomobject]@{ Name = 'CoK'; Required = @('KRYNN.CFG', 'ECL1.DAX', 'GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX'); Folder = 'COK'; LegacyWrappers = @('GAME') }
    [pscustomobject]@{ Name = 'DoK'; Required = @('DKK.CFG', 'ECL1.DAX', 'GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX'); Folder = 'DOK'; LegacyWrappers = @('GAME') }
    [pscustomobject]@{ Name = 'Pool'; Required = @('START.EXE', 'POOL.CFG', 'ECL1.DAX', 'GEO1.DAX'); Folder = 'POOLRAD'; LegacyWrappers = @('GAME') }
    [pscustomobject]@{ Name = 'Curse'; Required = @('START.EXE', 'CURSE.CFG', 'ECL2.DAX', 'GEO2.DAX'); Folder = 'CURSE'; LegacyWrappers = @('GAME') }
    [pscustomobject]@{ Name = 'Secret'; Required = @('START.EXE', 'BLADES.CFG', 'ECL1.DAX', 'GEO1.DAX'); Folder = 'SECRET'; LegacyWrappers = @('GAME') }
    [pscustomobject]@{ Name = 'Gateway'; Required = @('GAME.EXE', 'GAME.CFG', 'ZOUNDS.DAX', 'ECL2.DAX', 'GEO2.DAX'); Folder = 'GATEWAY'; LegacyWrappers = @('GAME') }
    [pscustomobject]@{ Name = 'Treasures'; Required = @('GAME.EXE', 'TREASURE.CFG', 'ZOUNDS.DAX', 'ECL1.DAX', 'GEO1.DAX'); Folder = 'TREASURE'; LegacyWrappers = @('GAME') }
    [pscustomobject]@{ Name = 'PoD'; Required = @('GAME.EXE', 'POOL4.CFG', 'GAME.OVR', 'ECL1.DAX', 'GEO1.DAX'); Folder = 'DARKNESS'; LegacyWrappers = @('GAME') }
    [pscustomobject]@{ Name = 'NWN'; Required = @('GAME.EXE', 'GAME.CFG', 'GAME.OVR', 'ECL0.DAX', 'GEO0.DAX'); Folder = 'NWN'; LegacyWrappers = @('GAME') }
    [pscustomobject]@{ Name = 'Buck'; Required = @('ECL1.DAX', 'GEO1.DAX', 'WALLDEF1.DAX', 'MON0CHA.DAX'); Folder = 'BUCK'; LegacyWrappers = @('GAME') }
    [pscustomobject]@{ Name = 'Matrix'; Required = @('START.EXE', 'MATRIX.CFG', 'ECL1.DAX', 'GEO1.DAX'); Folder = 'MATRIX'; LegacyWrappers = @('GAME') }
    [pscustomobject]@{ Name = 'DQK'; Required = @('DQK.EXE', 'DISK3\ECL.GLB', 'DISK3\GEO.GLB'); Folder = 'DQK'; LegacyWrappers = @('GAME') }
    [pscustomobject]@{ Name = 'FRUA'; Required = @('CKIT.EXE', 'DISK3\GEO.GLB'); Folder = 'FRUA'; LegacyWrappers = @('GAME') }
  )
}
