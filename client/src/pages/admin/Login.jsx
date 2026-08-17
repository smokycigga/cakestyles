import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../store/AuthContext";
import { errMsg } from "../../lib/api";
import { inputCls } from "../../components/admin/ui";

export default function AdminLogin() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Welcome back!");
      navigate("/admin");
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-wine-900 via-wine-800 to-wine-700 flex items-center justify-center p-4">
      <div className="bg-cream-50 rounded-3xl p-8 w-full max-w-sm shadow-2xl">
        <div className="text-center mb-8">
          <div className="font-display text-3xl font-semibold text-wine-800">Cakestyles</div>
          <div className="text-[10px] tracking-[0.3em] uppercase text-wine-400 mt-1">Admin Studio</div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className={inputCls}
            autoComplete="username"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            className={inputCls}
            autoComplete="current-password"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 bg-wine-700 hover:bg-wine-800 disabled:opacity-60 text-white font-medium px-6 py-2.5 rounded-xl transition-colors"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />} Sign In
          </button>
        </form>

        <p className="text-center text-xs text-cocoa-400 mt-6">
          <Link to="/" className="hover:text-wine-600">← Back to website</Link>
        </p>
      </div>
    </div>
  );
}
