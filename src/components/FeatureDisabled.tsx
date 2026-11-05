export function FeatureDisabled() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4 text-center">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">
          This feature is not enabled for your school
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Contact your school administrator or the platform team to turn it on.
        </p>
      </div>
    </div>
  )
}
