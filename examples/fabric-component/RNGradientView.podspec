require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "RNGradientView"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.license      = package["license"]
  s.authors      = { "Example" => "example@example.com" }
  s.homepage     = "https://example.com/react-native-gradient-view"
  s.platforms    = { :ios => "15.1" }
  s.source       = { :git => "https://example.com/react-native-gradient-view.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift}"

  # Same helper as a TurboModule library. For a COMPONENT it additionally wires
  # the generated ComponentDescriptor and the Fabric view registration, so the
  # component is visible to the renderer.
  install_modules_dependencies(s)
end
