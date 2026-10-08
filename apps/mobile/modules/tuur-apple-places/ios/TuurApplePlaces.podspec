Pod::Spec.new do |s|
  s.name           = 'TuurApplePlaces'
  s.version        = '1.0.0'
  s.summary        = 'Nearby break searches and their Apple map for tuur'
  s.description    = 'Ephemeral on-device MapKit searches for cafes, food, parks and restrooms.'
  s.author         = 'tuur'
  s.homepage       = 'https://tuur.app'
  s.license        = { :type => 'MIT', :file => '../LICENSE' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { :path => '.' }
  s.swift_version  = '5.0'
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'MapKit', 'CoreLocation'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
