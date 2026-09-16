require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "RNDeviceMetadata"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.license      = package["license"]
  s.authors      = { "Example" => "example@example.com" }
  s.homepage     = "https://example.com/react-native-device-metadata"
  s.platforms    = { :ios => "15.1" }
  s.source       = { :git => "https://example.com/react-native-device-metadata.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift}"

  # This single helper is what wires a library into the New Architecture. It
  # adds the React-Core dependency, the C++ standard and header search paths
  # the generated TurboModule sources need, and the Codegen build phase.
  # Doing it by hand is how you end up with a module that compiles but is
  # invisible to TurboModuleRegistry.
  install_modules_dependencies(s)
end
