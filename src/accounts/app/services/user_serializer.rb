# Consistent user representation across auth + account endpoints.
class UserSerializer
  def self.call(user)
    {
      id: user.id,
      email: user.email,
      premium: user.premium?
    }
  end
end
