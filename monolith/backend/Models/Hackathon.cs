using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CV_Generator.Models
{
    [Table("hackathons")]
    public class Hackathon
    {
        [Key]
        public Guid Id { get; set; }
        
        [Required]
        [MaxLength(200)]
        public string Name { get; set; } = string.Empty;
        
        public string? Organization { get; set; }
        public DateTime? Date { get; set; }
        public DateTime? StartDate { get; set; }
        public DateTime? EndDate { get; set; }
        public string? Description { get; set; }
        public string? Role { get; set; }
        public string? Result { get; set; } // e.g. "Winner", "Finalist"
        [MaxLength(300)]
        public string? ProjectUrl { get; set; }
        
        [Required]
        public Guid UserId { get; set; }

        public int SortOrder { get; set; } = 0;
    }
}
