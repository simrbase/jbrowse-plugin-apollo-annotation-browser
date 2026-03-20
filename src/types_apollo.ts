// Minimal typings for Apollo session/internetAccount
// to avoid pulling in Apollo packages as dependencies
export interface ApolloInternetAccountModel {
  type: string
  baseURL: string
  getAuthorizationToken(): Promise<string>
}
